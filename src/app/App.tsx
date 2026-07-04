import { useEffect, useState, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { mockPaymentProvider, createMercadoPagoCheckout } from "../lib/payment-provider";
import type { UserRole } from "../lib/database.types";
import { getUpcomingAvailableDays, generateSlotsForDay } from "../lib/scheduling";
import { downloadCsv } from "../lib/csv";
import { getLastMonths, bucketAmountsByMonth } from "../lib/revenue";
import { reportError } from "../lib/monitoring";
import { termsOfService, privacyPolicy, CURRENT_TERMS_VERSION, type LegalDocument } from "../content/legal";
import { uploadProfessionalDocument, listProfessionalDocuments, getDocumentSignedUrl, type ProfessionalDocument } from "../lib/documents";
import { uploadAvatar } from "../lib/avatar";
import { getLiveKitRoomAccess, type LiveKitRoomAccess } from "../lib/video";
import { getAISessionSummary, type AISessionSummary } from "../lib/ai";
import { formatAiSummaryText } from "../lib/aiSummary";
import { type Screen, screenToPath, pathToScreen } from "../lib/routing";
import { getWeekStart, getWeekDays, isSameDay, formatWeekRangeLabel } from "../lib/calendar";
import type { VerificationStatus } from "../lib/database.types";
import {
  Brain, Search, Star, Shield, Video, Calendar, FileText, CreditCard,
  BarChart2, Users, Settings, Bell, ChevronDown, ChevronRight, ChevronLeft,
  Check, X, Menu, Mic, MicOff, Phone, PhoneOff, Monitor, MessageSquare,
  Upload, Download, Plus, Filter, MapPin, Globe, Clock, DollarSign,
  Heart, Award, BookOpen, Zap, Lock, TrendingUp, ArrowUpRight, ArrowDownRight,
  AlertCircle, CheckCircle, User, LogOut, Home, Activity, Clipboard,
  Camera, Send, Paperclip, MoreHorizontal, Edit3, Trash2, RefreshCw,
  ChevronUp, Eye, EyeOff, Info, HelpCircle, Mail, Phone as PhoneIcon
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

type AuthenticatedScreenProps = {
  onNavigate: (s: Screen) => void;
  currentUser: AppUser;
  onSignOut: () => void;
};

type BookingDraft = {
  professionalId: string;
  professionalName: string;
  professionalRole: string;
  professionalImg: string;
  price: number;
  scheduledAt: string; // ISO timestamp
};

type DirectoryProfessional = {
  id?: string;
  name: string;
  role: string;
  crp?: string;
  crm?: string;
  bio?: string;
  img: string;
  rating: number;
  reviews: number;
  price: number;
  modalities: string[];
  specialties: string[];
  city: string;
  insurances: string[];
  yearsExperience: number;
  wait: string;
  approaches: string[];
};

// Only public marketing/auth screens belong in the top nav — authenticated areas are reached via
// AppShell's sidebar (and the role guard in App() bounces anyone who lands on a screen their role can't use).
const SCREENS: { id: Screen; label: string; group: string }[] = [
  { id: "landing", label: "Início", group: "Public" },
  { id: "directory", label: "Encontrar terapeuta", group: "Public" },
  { id: "pricing", label: "Sou profissional", group: "Public" },
  { id: "login", label: "Entrar", group: "Auth" },
];

// ─── Shared Components ────────────────────────────────────────────────────────

function Badge({ children, variant = "default", className = "" }: { children: React.ReactNode; variant?: "default" | "success" | "accent" | "warning" | "danger" | "outline"; className?: string }) {
  const styles = {
    default: "bg-secondary text-primary border border-border",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    accent: "bg-blue-50 text-blue-700 border border-blue-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    danger: "bg-red-50 text-red-700 border border-red-200",
    outline: "bg-white text-muted-foreground border border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]} ${className}`}>
      {children}
    </span>
  );
}

function Btn({ children, variant = "primary", size = "md", className = "", onClick, disabled }: {
  children: React.ReactNode; variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; className?: string; onClick?: () => void; disabled?: boolean;
}) {
  const base = "inline-flex items-center gap-2 font-medium rounded-xl transition-all duration-150 cursor-pointer select-none";
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-[#156038] shadow-sm",
    secondary: "bg-secondary text-secondary-foreground hover:bg-[#d4eddf] border border-border",
    outline: "bg-white text-foreground border border-border hover:bg-muted",
    ghost: "bg-transparent text-muted-foreground hover:bg-muted",
    danger: "bg-destructive text-destructive-foreground hover:opacity-90",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      className={`bg-card rounded-2xl border border-border shadow-sm ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

/** Fallback for the raw <img> spots that need a specific size/shape Avatar's fixed sizes don't
 *  cover (card thumbnails, hero photos) — same "photo or initials" behavior, custom className. */
function PhotoOrInitials({ src, name, className }: { src?: string; name: string; className: string }) {
  return src ? (
    <img src={src} alt={name} className={className} />
  ) : (
    <div className={`${className} bg-primary/10 text-primary font-semibold flex items-center justify-center flex-shrink-0`}>
      {getInitials(name)}
    </div>
  );
}

function Avatar({ name, src, size = "md", online }: { name: string; src?: string; size?: "sm" | "md" | "lg" | "xl"; online?: boolean }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-base", xl: "w-20 h-20 text-xl" };
  const initials = getInitials(name);
  return (
    <div className="relative inline-flex">
      {src ? (
        <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover bg-secondary`} />
      ) : (
        <div className={`${sizes[size]} rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center`}>
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${online ? "bg-emerald-500" : "bg-gray-300"}`} />
      )}
    </div>
  );
}

function Input({ label, placeholder, type = "text", icon, value, onChange, className = "" }: {
  label?: string; placeholder?: string; type?: string; icon?: React.ReactNode;
  value?: string; onChange?: (v: string) => void; className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-sm font-medium text-foreground">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          className={`w-full ${icon ? "pl-9" : "pl-3"} pr-3 py-2.5 bg-input-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all`}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, delta, icon, color = "green" }: { label: string; value: string; delta?: string; icon: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = { green: "bg-primary/10 text-primary", blue: "bg-blue-50 text-blue-600", amber: "bg-amber-50 text-amber-600", purple: "bg-purple-50 text-purple-600" };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
        {delta && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${delta.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>
            {delta.startsWith("+") ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{delta}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground font-display">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Card>
  );
}

// ─── Top Nav ──────────────────────────────────────────────────────────────────

function TopNav({ onScreenChange, current, currentUser, onSignOut }: {
  onScreenChange: (s: Screen) => void;
  current: Screen;
  currentUser: AppUser | null;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const homeScreen: Screen = currentUser
    ? currentUser.role === "professional" ? "pro-dashboard" : currentUser.role === "admin" ? "admin" : "patient-dashboard"
    : "login";

  // Logged-in users get "Meu painel"/"Sair" instead of "Entrar" — otherwise the public nav looks
  // logged-out even while a session is active (e.g. a patient browsing the public directory).
  const items = currentUser
    ? SCREENS.filter(s => s.id !== "login")
    : SCREENS;

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <button onClick={() => onScreenChange("landing")} className="flex items-center gap-2.5 font-bold text-foreground">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Brain size={16} className="text-white" />
          </div>
          <span className="text-lg font-display">MindCare</span>
        </button>
        <div className="hidden md:flex items-center gap-1">
          {items.map(s => (
            <button
              key={s.id}
              onClick={() => onScreenChange(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${current === s.id ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              {s.label}
            </button>
          ))}
          {currentUser && (
            <>
              <button onClick={() => onScreenChange(homeScreen)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-secondary transition-all">
                Meu painel
              </button>
              <button onClick={onSignOut} className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                Sair
              </button>
            </>
          )}
        </div>
        <button className="md:hidden p-2 rounded-lg hover:bg-muted" onClick={() => setMenuOpen(!menuOpen)}>
          <Menu size={20} />
        </button>
      </div>
      {menuOpen && (
        <div className="md:hidden border-t border-border bg-white p-3 grid grid-cols-2 gap-1">
          {items.map(s => (
            <button key={s.id} onClick={() => { onScreenChange(s.id); setMenuOpen(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all ${current === s.id ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              {s.label}
            </button>
          ))}
          {currentUser && (
            <>
              <button onClick={() => { onScreenChange(homeScreen); setMenuOpen(false); }} className="px-3 py-2 rounded-lg text-xs font-medium text-left text-primary hover:bg-muted">
                Meu painel
              </button>
              <button onClick={() => { onSignOut(); setMenuOpen(false); }} className="px-3 py-2 rounded-lg text-xs font-medium text-left text-muted-foreground hover:bg-muted">
                Sair
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

// ─── App Shell (sidebar for dashboard screens) ────────────────────────────────

function AppShell({
  children,
  title,
  navItems,
  userName,
  onSignOut,
}: {
  children: React.ReactNode;
  title: string;
  navItems: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }[];
  userName: string;
  onSignOut: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className={`${collapsed ? "w-16" : "w-60"} flex-shrink-0 bg-white border-r border-border flex flex-col transition-all duration-200`}>
        <div className="h-16 flex items-center px-4 border-b border-border gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Brain size={16} className="text-white" />
          </div>
          {!collapsed && <span className="font-bold text-foreground font-display">MindCare</span>}
          <button className="ml-auto p-1 rounded-lg hover:bg-muted" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item, i) => (
            <button
              key={i}
              disabled={!item.onClick}
              onClick={item.onClick}
              title={item.onClick ? undefined : "Em breve"}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                item.active
                  ? "bg-secondary text-primary"
                  : item.onClick
                    ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                    : "text-muted-foreground/40 cursor-default"
              }`}
            >
              {item.icon}
              {!collapsed && <span>{item.label}{!item.onClick && !collapsed ? " · em breve" : ""}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <button
            type="button"
            onClick={onSignOut}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted w-full`}
          >
            <LogOut size={16} />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6">
          <h1 className="font-semibold text-foreground font-display">{title}</h1>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-xl hover:bg-muted">
              <Bell size={18} className="text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <Avatar name={userName} size="sm" online={true} />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
    </div>
  );
}

// ─── SCREEN: Landing ──────────────────────────────────────────────────────────

function LandingPage({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [annual, setAnnual] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);

  const benefits = [
    { icon: <Shield size={22} />, title: "Profissionais Verificados", desc: "Todos os CRP/CRM são validados pela nossa equipe antes da publicação." },
    { icon: <Lock size={22} />, title: "Sigilo & Segurança", desc: "Dados criptografados em repouso e em trânsito. Conformidade com LGPD." },
    { icon: <Video size={22} />, title: "Consultas Online", desc: "Videochamadas integradas com gravação IA e prontuário eletrônico." },
    { icon: <Zap size={22} />, title: "Agendamento Inteligente", desc: "Calendário com lembretes automáticos e sincronização com Google Agenda." },
    { icon: <CreditCard size={22} />, title: "Pagamentos Seguros", desc: "Pix, cartão e recorrência. Repasse automático com nota fiscal." },
    { icon: <Brain size={22} />, title: "IA Clínica", desc: "Transcrição e resumo de sessões com geração automática de notas clínicas." },
  ];

  const plans = [
    { name: "Essencial", price: annual ? 79 : 99, desc: "Para profissionais iniciando online", features: ["5 pacientes ativos", "Agenda + lembretes", "Videochamada HD", "Prontuário básico", "Suporte por e-mail"] },
    { name: "Profissional", price: annual ? 159 : 199, desc: "O plano mais escolhido", features: ["Pacientes ilimitados", "IA de sessão", "Prontuário completo", "Receituário digital", "Dashboard financeiro", "Suporte prioritário"], highlight: true },
    { name: "Clínica", price: annual ? 399 : 499, desc: "Para equipes e clínicas", features: ["Tudo do Profissional", "Múltiplos profissionais", "Admin da clínica", "API de integração", "Relatórios avançados", "SLA garantido"] },
  ];

  const testimonials = [
    { name: "Dra. Fernanda Costa", role: "Psicóloga Clínica · CRP 06/12345", avatar: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=80&h=80&fit=crop&auto=format", text: "O MindCare transformou minha prática. A IA que transcreve as sessões me poupa mais de 2h por semana." },
    { name: "Dr. Rafael Mendes", role: "Psiquiatra · CRM 35/87654", avatar: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=80&h=80&fit=crop&auto=format", text: "O prontuário eletrônico integrado ao agendamento é exatamente o que eu precisava. Plataforma impecável." },
    { name: "Beatriz Alves", role: "Paciente há 8 meses", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&auto=format", text: "Encontrei minha terapeuta em 5 minutos. O pagamento pelo app é super seguro e prático." },
  ];

  const faqs = [
    { q: "Como os profissionais são verificados?", a: "Nossa equipe valida CRP/CRM junto ao conselho federal e estadual. O processo leva até 48h após o envio da documentação." },
    { q: "Posso cancelar a qualquer momento?", a: "Sim. Sem multa nem fidelidade. O acesso continua até o fim do período pago." },
    { q: "Os dados dos pacientes são seguros?", a: "Totalmente. Usamos criptografia AES-256 e seguimos rigorosamente a LGPD. Seus dados nunca são vendidos." },
    { q: "Existe app móvel?", a: "Sim! Apps nativos para iOS e Android para pacientes e profissionais. A plataforma web também é totalmente responsiva." },
    { q: "Como funciona o repasse para o profissional?", a: "O paciente paga pelo MindCare. Após a sessão concluída, o valor (menos a comissão de 10%) é transferido em até 2 dias úteis." },
  ];

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#E8F5EE] via-white to-[#EBF0F8] -z-0" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="success" className="mb-6"><CheckCircle size={12} />+2.400 profissionais verificados</Badge>
              <h1 className="text-5xl lg:text-6xl font-bold text-foreground leading-tight font-display mb-6">
                Cuidado mental <br />
                <span className="text-primary">com quem entende</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
                Encontre psicólogos e psiquiatras verificados, agende consultas online ou presenciais e acompanhe seu tratamento com segurança.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Btn variant="primary" size="lg" onClick={() => onNavigate("directory")}>
                  <Search size={18} />Encontrar terapeuta
                </Btn>
                <Btn variant="outline" size="lg" onClick={() => onNavigate("pricing")}>
                  Sou profissional
                </Btn>
              </div>
              <div className="flex items-center gap-6 mt-8">
                {[["4.9", "★ avaliação média"], ["98%", "satisfação"], ["24h", "suporte"]].map(([v, l]) => (
                  <div key={l}>
                    <p className="text-xl font-bold text-foreground font-display">{v}</p>
                    <p className="text-xs text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative hidden lg:block">
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&h=520&fit=crop&auto=format"
                alt="Psicóloga em consulta online"
                className="rounded-3xl shadow-2xl w-full object-cover h-[480px] bg-secondary"
              />
              {/* Floating cards */}
              <div className="absolute -left-8 top-1/4 bg-white rounded-2xl shadow-lg p-4 flex items-center gap-3 border border-border">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><CheckCircle size={18} /></div>
                <div><p className="text-xs font-semibold text-foreground">CRP Verificado</p><p className="text-xs text-muted-foreground">Dra. Fernanda Costa</p></div>
              </div>
              <div className="absolute -right-6 bottom-1/4 bg-white rounded-2xl shadow-lg p-4 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Próxima sessão</p>
                <p className="text-sm font-semibold text-foreground">Hoje, 16h00</p>
                <div className="flex items-center gap-1 mt-1"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /><p className="text-xs text-emerald-600">Sala aberta</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground font-display mb-3">Por que o MindCare?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">A plataforma completa para conectar pacientes e profissionais de saúde mental com segurança e eficiência.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((b, i) => (
            <Card key={i} className="p-6 hover:border-primary/30 transition-all">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4">{b.icon}</div>
              <h3 className="font-semibold text-foreground mb-2 font-display">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground font-display mb-3">Como funciona</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Busque", desc: "Filtre por especialidade, cidade, plano de saúde e disponibilidade.", icon: <Search size={22} /> },
              { step: "02", title: "Escolha", desc: "Veja perfis verificados, avaliações e agende diretamente.", icon: <User size={22} /> },
              { step: "03", title: "Consulte", desc: "Sessão presencial ou videochamada HD integrada à plataforma.", icon: <Video size={22} /> },
              { step: "04", title: "Evolua", desc: "Acompanhe seu progresso e histórico com segurança.", icon: <TrendingUp size={22} /> },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-4">{s.icon}</div>
                <span className="text-xs font-bold text-primary tracking-widest font-mono">{s.step}</span>
                <h3 className="text-lg font-semibold text-foreground font-display mt-1 mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground font-display mb-3">Planos para profissionais</h2>
          <div className="flex items-center justify-center gap-3 mt-4">
            <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Mensal</span>
            <button onClick={() => setAnnual(!annual)} className={`w-12 h-6 rounded-full transition-colors ${annual ? "bg-primary" : "bg-muted"} relative`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${annual ? "translate-x-7" : "translate-x-1"}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>Anual <Badge variant="success">-20%</Badge></span>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((p, i) => (
            <Card key={i} className={`p-8 flex flex-col ${p.highlight ? "ring-2 ring-primary relative" : ""}`}>
              {p.highlight && <Badge variant="success" className="absolute -top-3 left-1/2 -translate-x-1/2">Mais escolhido</Badge>}
              <h3 className="font-bold text-xl text-foreground font-display mb-1">{p.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{p.desc}</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground font-display">R${p.price}</span>
                <span className="text-muted-foreground text-sm">/mês</span>
              </div>
              <ul className="flex-1 space-y-3 mb-8">
                {p.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm text-foreground">
                    <Check size={15} className="text-primary flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <Btn variant={p.highlight ? "primary" : "outline"} className="w-full justify-center" onClick={() => onNavigate("checkout")}>
                Começar agora
              </Btn>
            </Card>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground font-display mb-3">O que dizem sobre nós</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Card key={i} className="p-6">
                <div className="flex mb-3">{Array(5).fill(0).map((_, j) => <Star key={j} size={14} className="text-amber-400 fill-amber-400" />)}</div>
                <p className="text-sm text-foreground leading-relaxed mb-4 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover bg-secondary" />
                  <div><p className="text-sm font-semibold text-foreground">{t.name}</p><p className="text-xs text-muted-foreground">{t.role}</p></div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground font-display mb-3">Dúvidas frequentes</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <Card key={i} className="overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-6 py-4 text-left text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
              >
                {f.q}
                {faqOpen === i ? <ChevronUp size={16} className="text-primary flex-shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />}
              </button>
              {faqOpen === i && <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">{f.a}</div>}
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary mx-6 mb-10 rounded-3xl">
        <div className="text-center text-white px-6">
          <h2 className="text-3xl font-bold font-display mb-4">Comece hoje, gratuitamente</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-md mx-auto">14 dias de Plano Profissional sem cobrar nada. Sem cartão de crédito.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Btn variant="secondary" size="lg" onClick={() => onNavigate("pricing")}>Ver planos</Btn>
            <button className="px-6 py-3 rounded-xl text-sm font-medium text-white border border-white/30 hover:bg-white/10 transition-colors">
              Agendar demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center"><Brain size={14} className="text-white" /></div>
            <span className="font-bold text-foreground font-display">MindCare</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 MindCare</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <button type="button" onClick={() => setLegalDoc(termsOfService)} className="hover:text-primary">Termos de Uso</button>
            <button type="button" onClick={() => setLegalDoc(privacyPolicy)} className="hover:text-primary">Política de Privacidade</button>
            <a href="#" className="hover:text-primary">Contato</a>
          </div>
        </div>
      </footer>
      <LegalModal document={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
}

// ─── SCREEN: Directory ────────────────────────────────────────────────────────

function DirectoryPage({ onNavigate, onSelectProfessional }: { onNavigate: (s: Screen) => void; onSelectProfessional: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [modality, setModality] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [insurance, setInsurance] = useState("all");
  const [dbProfessionals, setDbProfessionals] = useState<DirectoryProfessional[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [professionalsError, setProfessionalsError] = useState("");

  useEffect(() => {
    let active = true;

    const loadProfessionals = async () => {
      setLoadingProfessionals(true);
      setProfessionalsError("");

      const { data, error } = await supabase
        .from("professional_profiles")
        .select("id, bio, license_type, license_number, specialties, approaches, session_price, modalities, city, state, insurances, years_experience, profiles!inner(full_name, avatar_url)")
        .eq("verification_status", "verified")
        .is("profiles.suspended_at", null)
        .order("created_at", { ascending: false });

      if (!active) return;

      if (error) {
        reportError(error, { flow: "directory.loadProfessionals" });
        setProfessionalsError("Não foi possível carregar os profissionais verificados.");
        setDbProfessionals([]);
      } else if (data?.length) {
        setDbProfessionals(data.map((item: any): DirectoryProfessional => {
          const license = `${item.license_type ?? "CRP"} ${item.license_number}`;
          const modalities = (item.modalities ?? []).map((value: string) => value === "online" ? "Online" : "Presencial");

          return {
            id: item.id,
            name: item.profiles?.full_name ?? "Profissional verificado",
            role: item.license_type === "CRM" ? "Psiquiatra" : "Psicólogo(a)",
            crp: item.license_type === "CRP" ? license : undefined,
            crm: item.license_type === "CRM" ? license : undefined,
            bio: item.bio ?? undefined,
            img: item.profiles?.avatar_url ?? "",
            rating: 5,
            reviews: 0,
            price: Number(item.session_price ?? 0),
            modalities: modalities.length ? modalities : ["Online"],
            specialties: item.specialties?.length ? item.specialties : ["Psicoterapia"],
            city: item.city && item.state ? `${item.city}, ${item.state}` : item.city ?? "Online",
            insurances: item.insurances?.length ? item.insurances : ["Particular"],
            yearsExperience: Number(item.years_experience ?? 0),
            wait: "Agenda aberta",
            approaches: item.approaches ?? [],
          };
        }));
      } else {
        setDbProfessionals([]);
      }

      setLoadingProfessionals(false);
    };

    void loadProfessionals();

    return () => {
      active = false;
    };
  }, []);

  const directoryProfessionals = dbProfessionals;
  const specialtyOptions = Array.from(new Set(directoryProfessionals.flatMap(p => p.specialties))).sort();
  const insuranceOptions = Array.from(new Set(directoryProfessionals.flatMap(p => p.insurances))).sort();

  const filtered = directoryProfessionals.filter(p => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedCity = citySearch.trim().toLowerCase();
    const matchSearch = !normalizedSearch
      || p.name.toLowerCase().includes(normalizedSearch)
      || p.role.toLowerCase().includes(normalizedSearch)
      || p.specialties.some(s => s.toLowerCase().includes(normalizedSearch))
      || p.approaches.some(a => a.toLowerCase().includes(normalizedSearch));
    const matchCity = !normalizedCity || p.city.toLowerCase().includes(normalizedCity);
    const matchModality = modality === "all" || p.modalities.includes(modality === "online" ? "Online" : "Presencial");
    const matchSpecialty = specialty === "all" || p.specialties.some(s => s.toLowerCase() === specialty.toLowerCase());
    const matchInsurance = insurance === "all" || p.insurances.some(item => item.toLowerCase() === insurance.toLowerCase());
    return matchSearch && matchCity && matchModality && matchSpecialty && matchInsurance;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Search header */}
      <div className="bg-white border-b border-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input placeholder="Especialidade, nome ou abordagem..." icon={<Search size={16} />} value={search} onChange={setSearch} className="flex-1" />
            <Input placeholder="Cidade ou estado" icon={<MapPin size={16} />} value={citySearch} onChange={setCitySearch} className="md:w-52" />
            <select
              value={insurance}
              onChange={e => setInsurance(e.target.value)}
              className="px-4 py-2.5 bg-input-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Qualquer plano</option>
              {insuranceOptions.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={specialty}
              onChange={e => setSpecialty(e.target.value)}
              className="px-4 py-2.5 bg-input-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Qualquer especialidade</option>
              {specialtyOptions.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <Btn variant="primary"><Filter size={16} />Filtrar</Btn>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {[{ id: "all", label: "Todos" }, { id: "online", label: "Online" }, { id: "presencial", label: "Presencial" }].map(m => (
              <button key={m.id} onClick={() => setModality(m.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${modality === m.id ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>
                {m.label}
              </button>
            ))}
            {["Ansiedade", "Depressão", "Trauma", "TDAH", "Burnout"].map(sp => (
              <button key={sp} onClick={() => setSpecialty(specialty === sp ? "all" : sp)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${specialty === sp ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>
                {sp}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <p className="text-sm text-muted-foreground mb-6">
          {loadingProfessionals ? "Carregando profissionais..." : `${filtered.length} profissionais encontrados`}
        </p>
        {professionalsError && (
          <Card className="p-5 mb-5 border-red-200 bg-red-50">
            <p className="text-sm font-medium text-red-700">{professionalsError}</p>
            <p className="text-xs text-red-600 mt-1">Verifique as credenciais do Supabase e as políticas RLS do diretório público.</p>
          </Card>
        )}
        {!loadingProfessionals && !professionalsError && filtered.length === 0 && (
          <Card className="p-8 text-center mb-5">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
              <Search size={20} className="text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-foreground font-display">Nenhum profissional verificado encontrado</h2>
            <p className="text-sm text-muted-foreground mt-1">Ajuste os filtros ou execute o seed fake do MVP no Supabase.</p>
          </Card>
        )}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p, i) => (
            <Card key={p.id ?? i} className="p-5 hover:border-primary/30 transition-all cursor-pointer" onClick={() => { if (p.id) { onSelectProfessional(p.id); onNavigate("profile"); } }}>
              <div className="flex gap-4 mb-4">
                <PhotoOrInitials src={p.img || undefined} name={p.name} className="w-16 h-16 rounded-2xl object-cover bg-secondary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm font-display">{p.name}</h3>
                      <p className="text-xs text-muted-foreground">{p.role}</p>
                    </div>
                    <Badge variant="success" className="flex-shrink-0 gap-1"><Shield size={10} />{p.crp || p.crm}</Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={12} className="text-amber-400 fill-amber-400" />
                    <span className="text-xs font-semibold text-foreground">{p.rating}</span>
                    <span className="text-xs text-muted-foreground">({p.reviews})</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {p.specialties.map(s => <Badge key={s} variant="outline">{s}</Badge>)}
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {p.insurances.slice(0, 3).map(plan => <Badge key={plan} variant="accent">{plan}</Badge>)}
                {p.yearsExperience > 0 && <Badge variant="outline">{p.yearsExperience} anos de experiência</Badge>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                <span className="flex items-center gap-1"><MapPin size={11} />{p.city}</span>
                <span className="flex items-center gap-1"><Globe size={11} />{p.modalities.join(", ")}</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div>
                  <span className="text-xs text-muted-foreground">A partir de </span>
                  <span className="font-bold text-foreground font-display">R${p.price}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Clock size={11} />{p.wait}</span>
                  <Btn variant="primary" size="sm">Agendar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: Professional Profile ─────────────────────────────────────────────

type ProfileData = {
  id: string;
  name: string;
  role: string;
  license: string;
  bio: string;
  specialties: string[];
  approaches: string[];
  insurances: string[];
  city: string;
  yearsExperience: number;
  price: number;
  modalities: string[];
  img: string;
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ProfilePage({ onNavigate, professionalId, onBook }: {
  onNavigate: (s: Screen) => void;
  professionalId: string | null;
  onBook: (draft: BookingDraft) => void;
}) {
  const [tab, setTab] = useState("sobre");
  const [pro, setPro] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [availability, setAvailability] = useState<{ weekday: number | null; start_time: string; end_time: string }[]>([]);
  const [bookedTimes, setBookedTimes] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<{ name: string; rating: number; comment: string | null }[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  useEffect(() => {
    setPro(null);
    setSelectedDay(null);
    setSelectedSlot(null);

    if (!professionalId) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError("");

    (async () => {
      const [{ data: proData, error: proError }, { data: availData }, { data: reviewData }] = await Promise.all([
        supabase
          .from("professional_profiles")
          .select("id, bio, specialties, approaches, license_type, license_number, session_price, modalities, city, state, insurances, years_experience, profiles(full_name, avatar_url)")
          .eq("id", professionalId)
          .maybeSingle(),
        supabase
          .from("professional_availability")
          .select("weekday, start_time, end_time")
          .eq("professional_id", professionalId)
          .not("weekday", "is", null),
        supabase
          .from("reviews")
          .select("rating, comment, profiles(full_name)")
          .eq("professional_id", professionalId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (!active) return;

      if (proError || !proData) {
        setLoadError("Não foi possível carregar este profissional.");
        setLoading(false);
        return;
      }

      const item: any = proData;
      setPro({
        id: item.id,
        name: item.profiles?.full_name ?? "Profissional verificado",
        role: item.license_type === "CRM" ? "Psiquiatra" : "Psicólogo(a)",
        license: `${item.license_type ?? "CRP"} ${item.license_number}`,
        bio: item.bio ?? "Este profissional ainda não adicionou uma biografia.",
        specialties: item.specialties?.length ? item.specialties : ["Psicoterapia"],
        approaches: item.approaches ?? [],
        insurances: item.insurances?.length ? item.insurances : ["Particular"],
        city: item.city && item.state ? `${item.city}, ${item.state}` : item.city ?? "Online",
        yearsExperience: Number(item.years_experience ?? 0),
        price: Number(item.session_price ?? 0),
        modalities: (item.modalities ?? []).map((v: string) => (v === "online" ? "Online" : "Presencial")),
        img: item.profiles?.avatar_url ?? "",
      });
      setAvailability((availData ?? []) as any);
      setReviews(((reviewData ?? []) as any[]).map(r => ({ name: r.profiles?.full_name ?? "Paciente", rating: r.rating, comment: r.comment })));

      const now = new Date();
      const in14Days = new Date();
      in14Days.setDate(now.getDate() + 14);
      const { data: existing } = await supabase
        .from("appointments")
        .select("scheduled_at")
        .eq("professional_id", professionalId)
        .eq("status", "scheduled")
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", in14Days.toISOString());

      if (active) setBookedTimes(new Set((existing ?? []).map(a => a.scheduled_at)));
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [professionalId]);

  const upcomingDays = getUpcomingAvailableDays(availability);
  const slotsForDay = (day: Date) => generateSlotsForDay(availability, day, bookedTimes);

  const handleBook = () => {
    if (!pro || !selectedSlot) return;
    onBook({
      professionalId: pro.id,
      professionalName: pro.name,
      professionalRole: pro.role,
      professionalImg: pro.img,
      price: pro.price,
      scheduledAt: selectedSlot,
    });
    onNavigate("checkout");
  };

  const goToAvailability = () => setTab("disponibilidade");

  if (!professionalId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h2 className="font-semibold text-foreground font-display mb-2">Nenhum profissional selecionado</h2>
          <p className="text-sm text-muted-foreground mb-4">Volte ao diretório e escolha um profissional verificado para ver o perfil.</p>
          <Btn variant="primary" onClick={() => onNavigate("directory")}>Ver diretório</Btn>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Carregando perfil...</div>;
  }

  if (loadError || !pro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h2 className="font-semibold text-foreground font-display mb-2">Profissional não encontrado</h2>
          <p className="text-sm text-muted-foreground mb-4">{loadError || "Este perfil pode não estar mais disponível."}</p>
          <Btn variant="primary" onClick={() => onNavigate("directory")}>Ver diretório</Btn>
        </Card>
      </div>
    );
  }

  const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-white border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-shrink-0">
              <PhotoOrInitials src={pro.img || undefined} name={pro.name} className="w-32 h-32 rounded-3xl object-cover shadow-lg bg-secondary text-3xl" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-start gap-3 mb-2">
                <h1 className="text-2xl font-bold text-foreground font-display">{pro.name}</h1>
                <Badge variant="success"><Shield size={12} />{pro.license} Verificado</Badge>
              </div>
              <p className="text-muted-foreground mb-3">{pro.role} · {pro.yearsExperience} anos de experiência · {pro.city}</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {pro.specialties.map(s => <Badge key={s} variant="outline">{s}</Badge>)}
              </div>
              <div className="flex items-center gap-6 text-sm flex-wrap">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Star size={15} className="text-amber-400 fill-amber-400" />
                  {avgRating ? avgRating.toFixed(1) : "Novo"} <span className="font-normal text-muted-foreground">({reviews.length} avaliações)</span>
                </span>
                {pro.modalities.includes("Online") && <span className="flex items-center gap-1.5 text-muted-foreground"><Video size={15} className="text-primary" />Online</span>}
                {pro.modalities.includes("Presencial") && <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin size={15} className="text-primary" />Presencial</span>}
                <span className="font-bold text-foreground font-display">R${pro.price}/sessão</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Btn variant="primary" size="lg" onClick={goToAvailability}><Calendar size={16} />Agendar sessão</Btn>
              <Btn variant="outline"><MessageSquare size={16} />Enviar mensagem</Btn>
            </div>
          </div>
          <div className="flex gap-4 mt-6 border-t border-border pt-4">
            {["sobre", "abordagens", "avaliações", "disponibilidade"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`pb-2 text-sm font-medium capitalize border-b-2 transition-all ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 grid lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {tab === "sobre" && (
            <Card className="p-6">
              <h2 className="font-semibold text-foreground font-display mb-3">Sobre mim</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{pro.bio}</p>
            </Card>
          )}

          {tab === "abordagens" && (
            <Card className="p-6">
              <h2 className="font-semibold text-foreground font-display mb-4">Abordagens terapêuticas</h2>
              {pro.approaches.length ? (
                <div className="flex flex-wrap gap-2">
                  {pro.approaches.map(a => <Badge key={a} variant="accent">{a}</Badge>)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma abordagem cadastrada ainda.</p>
              )}
            </Card>
          )}

          {tab === "avaliações" && (
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
                <div className="text-center">
                  <p className="text-5xl font-bold text-foreground font-display">{avgRating ? avgRating.toFixed(1) : "—"}</p>
                  <div className="flex">{Array(5).fill(0).map((_, i) => <Star key={i} size={16} className={`text-amber-400 ${avgRating && i < Math.round(avgRating) ? "fill-amber-400" : ""}`} />)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{reviews.length} avaliações</p>
                </div>
              </div>
              {reviews.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há avaliações para este profissional.</p>}
              {reviews.map((r, i) => (
                <div key={i} className="py-4 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar name={r.name} size="sm" />
                    <span className="text-sm font-medium text-foreground">{r.name}</span>
                  </div>
                  <div className="flex mb-2">{Array(r.rating).fill(0).map((_, j) => <Star key={j} size={12} className="text-amber-400 fill-amber-400" />)}</div>
                  {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                </div>
              ))}
            </Card>
          )}

          {tab === "disponibilidade" && (
            <Card className="p-6">
              <h2 className="font-semibold text-foreground font-display mb-4">Selecione data e horário</h2>
              {upcomingDays.length === 0 && (
                <p className="text-sm text-muted-foreground">Este profissional ainda não configurou horários disponíveis.</p>
              )}
              {upcomingDays.length > 0 && (
                <>
                  <div className="grid grid-cols-5 gap-2 mb-6">
                    {upcomingDays.map(d => (
                      <button
                        key={d.toISOString()}
                        onClick={() => { setSelectedDay(d); setSelectedSlot(null); }}
                        className={`py-3 rounded-xl text-xs font-medium text-center transition-all ${selectedDay?.getTime() === d.getTime() ? "bg-primary text-white" : "bg-muted hover:bg-secondary hover:text-primary"}`}
                      >
                        {WEEKDAY_LABELS[d.getDay()]} {String(d.getDate()).padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                  {selectedDay && (
                    <div className="grid grid-cols-4 gap-2">
                      {slotsForDay(selectedDay).map(s => (
                        <button
                          key={s.iso}
                          disabled={s.taken}
                          onClick={() => setSelectedSlot(s.iso)}
                          className={`py-2.5 rounded-xl text-xs font-medium transition-all ${s.taken ? "bg-muted text-muted-foreground/40 line-through cursor-not-allowed" : selectedSlot === s.iso ? "bg-primary text-white" : "bg-muted hover:bg-secondary hover:text-primary"}`}
                        >
                          {s.time}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedDay && selectedSlot && (
                    <div className="mt-4 p-4 bg-secondary rounded-xl flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {WEEKDAY_LABELS[selectedDay.getDay()]} {String(selectedDay.getDate()).padStart(2, "0")} · {new Date(selectedSlot).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · R${pro.price}
                      </p>
                      <Btn variant="primary" size="sm" onClick={handleBook}>Confirmar</Btn>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar booking */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-foreground font-display mb-4">Agendar consulta</h3>
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sessão individual</span>
                <span className="font-bold font-display">R${pro.price}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Modalidade</span>
                <div className="flex gap-1">
                  {pro.modalities.map(m => <Badge key={m} variant={m === "Online" ? "success" : "outline"}>{m}</Badge>)}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Horários</span>
                <span className="text-emerald-600 font-medium flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full" />{upcomingDays.length > 0 ? "Agenda aberta" : "Sem horários"}</span>
              </div>
            </div>
            <Btn variant="primary" className="w-full justify-center" onClick={goToAvailability}>
              <Calendar size={16} />Agendar agora
            </Btn>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Convênios aceitos</h3>
            <div className="flex flex-wrap gap-2">
              {pro.insurances.map(p => <Badge key={p} variant="outline">{p}</Badge>)}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: Login ────────────────────────────────────────────────────────────

function LegalModal({ document, onClose }: { document: LegalDocument | null; onClose: () => void }) {
  if (!document) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-bold text-foreground font-display">{document.title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Atualizado em {document.updatedAt}</p>
        <div className="space-y-4">
          {document.sections.map(s => (
            <div key={s.heading}>
              <h3 className="text-sm font-semibold text-foreground mb-1">{s.heading}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoginPage({ onNavigate, initialInfo }: { onNavigate: (s: Screen) => void; initialInfo?: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [userType, setUserType] = useState<"patient" | "professional">("patient");
  const [showPass, setShowPass] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState(initialInfo ?? "");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const handleForgotPassword = async () => {
    setForgotError("");

    if (!forgotEmail.trim()) {
      setForgotError("Informe seu e-mail para receber o link de recuperação.");
      return;
    }

    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setForgotLoading(false);

    if (error) {
      setForgotError(error.message);
      return;
    }

    setForgotSent(true);
  };

  const handleAuth = async () => {
    setAuthError("");
    setAuthInfo("");
    setLoading(true);

    try {
      const typedPassword = password;

      if (mode === "register" && !acceptedTerms) {
        throw new Error("Você precisa aceitar os Termos de Uso e a Política de Privacidade para se cadastrar.");
      }

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: typedPassword,
        });

        if (error) throw error;
        // Redirect happens once currentUser loads, see the "login" redirect effect near navigate().
        return;
      }

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (!fullName) throw new Error("Informe nome e sobrenome.");
      if (!email.trim()) throw new Error("Informe o e-mail.");
      if (typedPassword.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
      if (userType === "professional" && !licenseNumber.trim()) {
        throw new Error("Informe o CRP/CRM para cadastro profissional.");
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: typedPassword,
        options: {
          data: {
            full_name: fullName,
            role: userType,
            // Consumed by the handle_new_user() trigger, not inserted client-side: signUp()
            // returns no session until the e-mail is confirmed, so an authenticated insert here
            // would be rejected by RLS. The trigger runs security definer, at account-creation
            // time, regardless of confirmation status.
            ...(userType === "professional" && {
              license_type: licenseNumber.toUpperCase().includes("CRM") ? "CRM" : "CRP",
              license_number: licenseNumber.trim(),
            }),
          },
        },
      });

      if (error) throw error;

      if (!data.session) {
        setAuthInfo("Cadastro criado. Confirme seu e-mail antes de entrar.");
        setMode("login");
        return;
      }
      // Session exists (email confirmation disabled): redirect happens once currentUser loads,
      // see the "login" redirect effect near navigate().
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível autenticar.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError("");

    if (mode === "register" && !acceptedTerms) {
      setAuthError("Você precisa aceitar os Termos de Uso e a Política de Privacidade para se cadastrar.");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Brain size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-display">MindCare</h1>
          <p className="text-sm text-muted-foreground mt-1">Plataforma de saúde mental</p>
        </div>

        <Card className="p-8">
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            <button type="button" onClick={() => setMode("login")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "login" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}>Entrar</button>
            <button type="button" onClick={() => setMode("register")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "register" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}>Cadastrar</button>
          </div>

          {mode === "register" && (
            <div className="flex gap-2 mb-5">
              <button type="button" onClick={() => setUserType("patient")} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${userType === "patient" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>
                <Heart size={14} className="inline mr-1.5" />Paciente
              </button>
              <button type="button" onClick={() => setUserType("professional")} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${userType === "professional" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>
                <Award size={14} className="inline mr-1.5" />Profissional
              </button>
            </div>
          )}

          <div className="space-y-4">
            {mode === "register" && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Nome" placeholder="Ana" value={firstName} onChange={setFirstName} />
                <Input label="Sobrenome" placeholder="Beatriz" value={lastName} onChange={setLastName} />
              </div>
            )}
            <Input label="E-mail" placeholder="seu@email.com" type="email" icon={<Mail size={15} />} value={email} onChange={setEmail} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-3 pr-10 py-2.5 bg-input-background border border-border rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {mode === "register" && userType === "professional" && (
              <Input label="CRP/CRM" placeholder="Ex: CRP 06/12345" icon={<Shield size={15} />} value={licenseNumber} onChange={setLicenseNumber} />
            )}
          </div>

          {mode === "register" && (
            <label className="flex items-start gap-2 mt-4 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} className="mt-0.5 accent-primary" />
              <span>
                Li e aceito os{" "}
                <button type="button" onClick={() => setLegalDoc(termsOfService)} className="text-primary hover:underline">Termos de Uso</button>
                {" "}e a{" "}
                <button type="button" onClick={() => setLegalDoc(privacyPolicy)} className="text-primary hover:underline">Política de Privacidade</button>.
              </span>
            </label>
          )}

          {mode === "login" && (
            <div className="text-right mt-2">
              <button
                type="button"
                onClick={() => { setShowForgotPassword(true); setForgotSent(false); setForgotError(""); setForgotEmail(email); }}
                className="text-xs text-primary hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
          )}

          {authError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {authError}
            </div>
          )}
          {authInfo && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {authInfo}
            </div>
          )}

          <Btn variant="primary" className="w-full justify-center mt-6" onClick={handleAuth} disabled={loading || (mode === "register" && !acceptedTerms)}>
            {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
          </Btn>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={mode === "register" && !acceptedTerms}
            className="w-full flex items-center justify-center gap-3 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            Continuar com Google
          </button>
        </Card>
      </div>
      <LegalModal document={legalDoc} onClose={() => setLegalDoc(null)} />

      {showForgotPassword && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowForgotPassword(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">Recuperar senha</h2>
              <button type="button" onClick={() => setShowForgotPassword(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            {forgotSent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Informe seu e-mail e enviaremos um link para redefinir sua senha.</p>
                <Input label="E-mail" placeholder="seu@email.com" type="email" icon={<Mail size={15} />} value={forgotEmail} onChange={setForgotEmail} />
                {forgotError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{forgotError}</div>
                )}
                <Btn variant="primary" className="w-full justify-center" onClick={handleForgotPassword} disabled={forgotLoading}>
                  {forgotLoading ? "Enviando..." : "Enviar link de recuperação"}
                </Btn>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SCREEN: Reset Password ───────────────────────────────────────────────────

function ResetPasswordScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      reportError(updateError, { flow: "resetPassword.updateUser" });
      setError(updateError.message);
      return;
    }

    setDone(true);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-display">Definir nova senha</h1>
        </div>
        <Card className="p-8">
          {done ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Senha atualizada com sucesso.
              </div>
              <Btn variant="primary" className="w-full justify-center" onClick={() => onNavigate("login")}>Ir para o login</Btn>
            </div>
          ) : (
            <div className="space-y-4">
              <Input label="Nova senha" placeholder="••••••••" type="password" value={password} onChange={setPassword} />
              <Input label="Confirmar nova senha" placeholder="••••••••" type="password" value={confirmPassword} onChange={setConfirmPassword} />
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <Btn variant="primary" className="w-full justify-center" onClick={handleSubmit} disabled={loading}>
                {loading ? "Salvando..." : "Salvar nova senha"}
              </Btn>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── SCREEN: Patient Dashboard ────────────────────────────────────────────────

type PatientAppointment = {
  id: string;
  scheduledAt: string;
  modality: string;
  status: string;
  price: number;
  professionalName: string;
  professionalImg: string;
};

function PatientDashboard({ onNavigate, currentUser, onSignOut, onEnterVideo }: AuthenticatedScreenProps & { onEnterVideo: (appointmentId: string) => void }) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", active: true, onClick: () => onNavigate("patient-dashboard") },
    { icon: <Calendar size={18} />, label: "Consultas", onClick: () => onNavigate("patient-dashboard") },
    { icon: <MessageSquare size={18} />, label: "Mensagens" },
    { icon: <FileText size={18} />, label: "Documentos" },
    { icon: <CreditCard size={18} />, label: "Pagamentos" },
    { icon: <Settings size={18} />, label: "Configurações" },
  ];

  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [totalInvested, setTotalInvested] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!window.confirm("Cancelar esta consulta? Essa ação não pode ser desfeita.")) return;
    setCancellingId(appointmentId);
    const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
    setCancellingId(null);
    if (error) {
      reportError(error, { flow: "patientDashboard.cancelAppointment" });
      window.alert("Não foi possível cancelar a consulta. Tente novamente.");
      return;
    }
    setAppointments(prev => prev.map(a => (a.id === appointmentId ? { ...a, status: "cancelled" } : a)));
  };

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, modality, status, price, professional_profiles(profiles(full_name, avatar_url))")
        .eq("patient_id", currentUser.id)
        .order("scheduled_at", { ascending: true });

      if (!active) return;

      const rows: PatientAppointment[] = ((data ?? []) as any[]).map(a => ({
        id: a.id,
        scheduledAt: a.scheduled_at,
        modality: a.modality,
        status: a.status,
        price: Number(a.price),
        professionalName: a.professional_profiles?.profiles?.full_name ?? "Profissional",
        professionalImg: a.professional_profiles?.profiles?.avatar_url ?? "",
      }));
      setAppointments(rows);

      const ids = rows.map(r => r.id);
      if (ids.length) {
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("amount, appointment_id")
          .in("appointment_id", ids)
          .eq("status", "paid");
        if (active) setTotalInvested((paymentsData ?? []).reduce((sum, p) => sum + Number(p.amount), 0));
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const now = new Date();
  const upcoming = appointments.filter(a => a.status === "scheduled" && new Date(a.scheduledAt) >= now);
  const past = appointments.filter(a => a.status !== "scheduled" || new Date(a.scheduledAt) < now);
  const completedCount = appointments.filter(a => a.status === "completed").length;
  const distinctProfessionals = new Set(appointments.map(a => a.professionalName)).size;
  const firstName = currentUser.fullName.split(" ")[0];

  const nextSessionLabel = upcoming.length
    ? new Date(upcoming[0].scheduledAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" }) +
      " às " + new Date(upcoming[0].scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <AppShell title="Meu Painel" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
      <div className="space-y-6">
        {/* Welcome */}
        <Card className="p-6 bg-gradient-to-r from-primary to-[#156038] text-white border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Olá,</p>
              <h2 className="text-2xl font-bold font-display">{firstName} 👋</h2>
              <p className="text-white/70 text-sm mt-2">
                {nextSessionLabel ? <>Próxima sessão em <strong className="text-white">{nextSessionLabel}</strong></> : "Nenhuma sessão agendada no momento"}
              </p>
            </div>
            <div className="text-right">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                <Heart size={28} className="text-white" />
              </div>
            </div>
          </div>
        </Card>

        {/* Upcoming */}
        <div>
          <h2 className="text-base font-semibold text-foreground font-display mb-3">Próximas consultas</h2>
          {loading && <p className="text-sm text-muted-foreground">Carregando consultas...</p>}
          {!loading && upcoming.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">Você ainda não tem consultas agendadas.</p>
              <Btn variant="primary" size="sm" onClick={() => onNavigate("directory")}><Search size={14} />Encontrar terapeuta</Btn>
            </Card>
          )}
          <div className="space-y-3">
            {upcoming.map(a => (
              <Card key={a.id} className="p-4 flex items-center gap-4">
                <PhotoOrInitials src={a.professionalImg || undefined} name={a.professionalName} className="w-12 h-12 rounded-2xl object-cover bg-secondary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{a.professionalName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(a.scheduledAt).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · {new Date(a.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {a.modality === "online" ? "Online" : "Presencial"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {a.modality === "online" && (
                    <Btn variant="primary" size="sm" onClick={() => { onEnterVideo(a.id); onNavigate("video"); }}><Video size={14} />Entrar</Btn>
                  )}
                  <Btn variant="outline" size="sm" disabled={cancellingId === a.id} onClick={() => handleCancelAppointment(a.id)}>
                    {cancellingId === a.id ? "Cancelando..." : "Cancelar"}
                  </Btn>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sessões realizadas" value={String(completedCount)} icon={<CheckCircle size={18} />} color="green" />
          <StatCard label="Consultas agendadas" value={String(upcoming.length)} icon={<Calendar size={18} />} color="blue" />
          <StatCard label="Profissionais" value={String(distinctProfessionals)} icon={<Heart size={18} />} color="purple" />
          <StatCard label="Total investido" value={`R$${totalInvested.toFixed(2).replace(".", ",")}`} icon={<DollarSign size={18} />} color="amber" />
        </div>

        {/* History */}
        <Card className="p-6">
          <h3 className="font-semibold text-foreground font-display mb-4">Histórico de consultas</h3>
          {past.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma consulta anterior ainda.</p>}
          <div className="divide-y divide-border">
            {past.map(a => (
              <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.professionalName}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</p>
                </div>
                <Badge variant={a.status === "completed" ? "success" : a.status === "cancelled" ? "danger" : "outline"}>
                  {a.status === "completed" ? "Concluída" : a.status === "cancelled" ? "Cancelada" : a.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

// ─── SCREEN: Professional Dashboard ──────────────────────────────────────────

type ProAppointment = {
  id: string;
  scheduledAt: string;
  modality: string;
  status: string;
  price: number;
  patientName: string;
  patientImg: string;
};

const STATUS_COLORS: Record<string, string> = { scheduled: "#1B7A48", completed: "#5B8DEF", cancelled: "#D9E4DE" };
const STATUS_LABELS: Record<string, string> = { scheduled: "Agendadas", completed: "Concluídas", cancelled: "Canceladas" };

function ProfessionalDashboard({ onNavigate, currentUser, onSignOut, onEnterVideo }: AuthenticatedScreenProps & { onEnterVideo: (appointmentId: string) => void }) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", active: true, onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("ehr") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [appointments, setAppointments] = useState<ProAppointment[]>([]);
  const [revenueByMonth, setRevenueByMonth] = useState<{ month: string; receita: number }[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [documents, setDocuments] = useState<ProfessionalDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const refreshDocuments = async () => {
    try {
      setDocuments(await listProfessionalDocuments(currentUser.id));
    } catch (error) {
      reportError(error, { flow: "professionalDashboard.refreshDocuments" });
    }
  };

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase
        .from("professional_profiles")
        .select("verification_status, city, bio, session_price, modalities")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (!active) return;
      setVerificationStatus(data?.verification_status ?? null);
      setProfileIncomplete(!data?.city || !data?.bio || !data?.session_price || !data?.modalities?.length);
    })();

    void refreshDocuments();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const handleUploadDocument = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      await uploadProfessionalDocument(currentUser.id, file);
      await refreshDocuments();
      void supabase.functions.invoke("notify-admin-document", { body: { professionalId: currentUser.id, fileName: file.name } });
    } catch (error) {
      reportError(error, { flow: "professionalDashboard.uploadDocument" });
      setUploadError(error instanceof Error ? error.message : "Não foi possível enviar o documento.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);

      const [{ data: apptData }, { data: paymentRows }, { data: reviewRows }] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, scheduled_at, modality, status, price, profiles(full_name, avatar_url)")
          .eq("professional_id", currentUser.id)
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("payments")
          .select("amount, appointments!inner(professional_id, scheduled_at)")
          .eq("appointments.professional_id", currentUser.id)
          .eq("status", "paid"),
        supabase.from("reviews").select("rating").eq("professional_id", currentUser.id),
      ]);

      if (!active) return;

      setAppointments(((apptData ?? []) as any[]).map(a => ({
        id: a.id,
        scheduledAt: a.scheduled_at,
        modality: a.modality,
        status: a.status,
        price: Number(a.price),
        patientName: a.profiles?.full_name ?? "Paciente",
        patientImg: a.profiles?.avatar_url ?? "",
      })));

      const months = getLastMonths(6);
      const paymentEntries = ((paymentRows ?? []) as any[])
        .filter(p => p.appointments?.scheduled_at)
        .map(p => ({ amount: Number(p.amount), dateIso: p.appointments.scheduled_at as string }));
      setRevenueByMonth(bucketAmountsByMonth(paymentEntries, months).map(b => ({ month: b.month, receita: b.total })));

      const ratings = ((reviewRows ?? []) as any[]).map(r => r.rating as number);
      setAvgRating(ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null);

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const now = new Date();
  const upcoming = appointments.filter(a => a.status === "scheduled" && new Date(a.scheduledAt) >= now).slice(0, 5);
  const distinctPatients = new Set(appointments.map(a => a.patientName)).size;
  const thisMonthSessions = appointments.filter(a => {
    const d = new Date(a.scheduledAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const statusBreakdown = (["scheduled", "completed", "cancelled"] as const)
    .map(status => ({ status, value: appointments.filter(a => a.status === status).length }))
    .filter(s => s.value > 0);
  const currentMonthRevenue = revenueByMonth[revenueByMonth.length - 1]?.receita ?? 0;

  const recentPatientsMap = new Map<string, { name: string; img: string; lastSession: string }>();
  appointments.forEach(a => {
    const existing = recentPatientsMap.get(a.patientName);
    if (!existing || new Date(a.scheduledAt) > new Date(existing.lastSession)) {
      recentPatientsMap.set(a.patientName, { name: a.patientName, img: a.patientImg, lastSession: a.scheduledAt });
    }
  });
  const recentPatients = Array.from(recentPatientsMap.values())
    .sort((a, b) => new Date(b.lastSession).getTime() - new Date(a.lastSession).getTime())
    .slice(0, 5);

  return (
    <AppShell title="Dashboard Profissional" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
      <div className="space-y-6">
        {profileIncomplete && (
          <Card className="p-5 border-blue-200 bg-blue-50">
            <div className="flex items-start gap-3">
              <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-800">Complete seu perfil</p>
                <p className="text-xs text-blue-700 mt-1">
                  Cidade, bio, valor da sessão e modalidade de atendimento ainda estão faltando. Sem esses dados, você não aparece corretamente na busca do diretório (a busca por cidade/estado depende disso).
                </p>
              </div>
              <Btn variant="primary" size="sm" onClick={() => onNavigate("professional-settings")}>Completar agora</Btn>
            </div>
          </Card>
        )}

        {verificationStatus && verificationStatus !== "verified" && (
          <Card className={`p-5 ${verificationStatus === "rejected" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle size={18} className={verificationStatus === "rejected" ? "text-red-600" : "text-amber-600"} />
              <div>
                <p className={`text-sm font-semibold ${verificationStatus === "rejected" ? "text-red-800" : "text-amber-800"}`}>
                  {verificationStatus === "rejected" ? "Verificação rejeitada" : "Verificação pendente"}
                </p>
                <p className={`text-xs mt-1 ${verificationStatus === "rejected" ? "text-red-700" : "text-amber-700"}`}>
                  Envie uma foto ou PDF legível da sua carteira do {"{CRP/CRM}"} (ou do comprovante de
                  inscrição no conselho, emitido no site do seu conselho regional) para aparecer no
                  diretório público. O arquivo fica guardado num espaço privado — só você e a equipe
                  MindCare que analisa cadastros conseguem abri-lo. Uma pessoa da equipe confere o
                  documento e confirma seu registro na consulta pública oficial do
                  {" "}{verificationStatus === "rejected" ? "conselho" : "CFP/CFM"} antes de aprovar;
                  isso costuma levar até 48h.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer">
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-border hover:bg-muted ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  <Upload size={14} />{uploading ? "Enviando..." : "Enviar documento"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*"
                  disabled={uploading}
                  onChange={e => { const file = e.target.files?.[0]; if (file) void handleUploadDocument(file); e.target.value = ""; }}
                />
              </label>
              {documents.map(doc => (
                <Badge key={doc.id} variant="outline"><FileText size={11} />{doc.fileName}</Badge>
              ))}
            </div>
            {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Pacientes atendidos" value={String(distinctPatients)} icon={<Users size={18} />} color="green" />
          <StatCard label="Sessões este mês" value={String(thisMonthSessions)} icon={<Calendar size={18} />} color="blue" />
          <StatCard label="Receita (mês atual)" value={`R$${currentMonthRevenue.toFixed(2).replace(".", ",")}`} icon={<DollarSign size={18} />} color="amber" />
          <StatCard label="Avaliação média" value={avgRating ? `${avgRating.toFixed(1)} ★` : "Sem avaliações"} icon={<Star size={18} />} color="purple" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            <h3 className="font-semibold text-foreground font-display mb-4">Receita mensal</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueByMonth}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(1)}k`} />
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF6F1" vertical={false} />
                <Tooltip formatter={(v: number) => [`R$${v.toLocaleString()}`, "Receita"]} contentStyle={{ borderRadius: 12, border: "1px solid #E8F5EE", fontSize: 12 }} />
                <Bar dataKey="receita" fill="#1B7A48" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-foreground font-display mb-4">Consultas por status</h3>
            {statusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma consulta ainda.</p>
            ) : (
              <>
                <div className="flex items-center justify-center mb-4">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={70} startAngle={90} endAngle={-270} dataKey="value">
                        {statusBreakdown.map(s => <Cell key={s.status} fill={STATUS_COLORS[s.status]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {statusBreakdown.map(s => (
                    <div key={s.status} className="flex justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s.status] }} />{STATUS_LABELS[s.status]}</span>
                      <span className="font-medium">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground font-display">Próximas sessões</h3>
              <Btn variant="ghost" size="sm" onClick={() => onNavigate("calendar")}>Ver agenda <ChevronRight size={14} /></Btn>
            </div>
            {!loading && upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma sessão agendada.</p>}
            <div className="space-y-3">
              {upcoming.map(a => (
                <div key={a.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <Avatar name={a.patientName} src={a.patientImg || undefined} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{a.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.scheduledAt).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · {new Date(a.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {a.modality === "online" && (
                    <Btn variant="ghost" size="sm" onClick={() => { onEnterVideo(a.id); onNavigate("video"); }}><Video size={14} /></Btn>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground font-display">Pacientes recentes</h3>
              <Btn variant="ghost" size="sm" onClick={() => onNavigate("ehr")}>Prontuários <ChevronRight size={14} /></Btn>
            </div>
            {recentPatients.length === 0 && <p className="text-sm text-muted-foreground">Nenhum paciente ainda.</p>}
            <div className="space-y-3">
              {recentPatients.map(p => (
                <div key={p.name} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <Avatar name={p.name} src={p.img || undefined} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Última sessão: {new Date(p.lastSession).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

// ─── SCREEN: Calendar ─────────────────────────────────────────────────────────

type CalendarAppointment = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  modality: string;
  status: string;
  patientId: string;
  patientName: string;
  googleEventId: string | null;
};

const CALENDAR_HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00–19:00
const CALENDAR_DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function CalendarScreen({ onNavigate, currentUser, onSignOut, onEnterVideo, onOpenEhr }: AuthenticatedScreenProps & { onEnterVideo: (appointmentId: string) => void; onOpenEhr: (patientId: string, appointmentId: string) => void }) {
  const [view, setView] = useState<"week" | "month" | "day">("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", active: true, onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("ehr") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [availabilitySummary, setAvailabilitySummary] = useState("Nenhum horário definido ainda");
  const [selectedAppointment, setSelectedAppointment] = useState<CalendarAppointment | null>(null);

  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newPatientId, setNewPatientId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newModality, setNewModality] = useState<"online" | "presencial">("online");
  const [newError, setNewError] = useState("");
  const [creating, setCreating] = useState(false);

  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMessage, setGoogleMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const handleCancelAppointment = async () => {
    if (!selectedAppointment) return;
    if (!window.confirm("Cancelar esta consulta? Essa ação não pode ser desfeita.")) return;
    setCancelling(true);
    const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", selectedAppointment.id);
    setCancelling(false);
    if (error) {
      reportError(error, { flow: "calendarScreen.cancelAppointment" });
      window.alert("Não foi possível cancelar a consulta. Tente novamente.");
      return;
    }
    setAppointments(prev => prev.map(a => (a.id === selectedAppointment.id ? { ...a, status: "cancelled" } : a)));
    setSelectedAppointment(prev => (prev ? { ...prev, status: "cancelled" } : prev));
  };

  const weekStart = getWeekStart(anchorDate);
  const weekDays = getWeekDays(weekStart);
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);

  const reloadAppointments = async () => {
    setLoadingAppointments(true);
    const { data } = await supabase
      .from("appointments")
      .select("id, scheduled_at, duration_minutes, modality, status, patient_id, google_event_id, profiles(full_name)")
      .eq("professional_id", currentUser.id)
      .gte("scheduled_at", monthStart.toISOString())
      .lt("scheduled_at", monthEnd.toISOString())
      .order("scheduled_at", { ascending: true });

    setAppointments(((data ?? []) as any[]).map(a => ({
      id: a.id,
      scheduledAt: a.scheduled_at,
      durationMinutes: a.duration_minutes,
      modality: a.modality,
      status: a.status,
      patientId: a.patient_id,
      patientName: a.profiles?.full_name ?? "Paciente",
      googleEventId: a.google_event_id,
    })));
    setLoadingAppointments(false);
  };

  useEffect(() => {
    void reloadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, anchorDate.getFullYear(), anchorDate.getMonth()]);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase
        .from("professional_availability")
        .select("weekday, start_time, end_time")
        .eq("professional_id", currentUser.id)
        .not("weekday", "is", null)
        .order("weekday", { ascending: true });

      if (!active || !data || data.length === 0) return;

      const dayLabels = Array.from(new Set(data.map(d => d.weekday)))
        .sort()
        .map(w => WEEKDAY_OPTIONS.find(o => o.value === w)?.label.slice(0, 3) ?? String(w))
        .join(", ");
      const minStart = data.reduce((min, d) => (d.start_time < min ? d.start_time : min), data[0].start_time).slice(0, 5);
      const maxEnd = data.reduce((max, d) => (d.end_time > max ? d.end_time : max), data[0].end_time).slice(0, 5);
      setAvailabilitySummary(`${dayLabels} · ${minStart}–${maxEnd}`);
    })();

    (async () => {
      const { data } = await supabase.from("appointments").select("patient_id, profiles(full_name)").eq("professional_id", currentUser.id);
      if (!active) return;
      const map = new Map<string, string>();
      ((data ?? []) as any[]).forEach(a => {
        if (!map.has(a.patient_id)) map.set(a.patient_id, a.profiles?.full_name ?? "Paciente");
      });
      setPatients(Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    })();

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (active) setGoogleConnected(Boolean(data.session?.provider_token));
    })();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const appointmentsFor = (day: Date, hour: number) =>
    appointments.filter(a => {
      const d = new Date(a.scheduledAt);
      return isSameDay(d, day) && d.getHours() === hour;
    });

  const openNewAppointmentModal = (day?: Date, hour?: number) => {
    setNewError("");
    setNewPatientId(patients[0]?.id ?? "");
    setNewDate(day ? day.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setNewTime(hour !== undefined ? `${String(hour).padStart(2, "0")}:00` : "09:00");
    setShowNewModal(true);
  };

  const handleCreateAppointment = async () => {
    setNewError("");

    if (!newPatientId) {
      setNewError("Selecione um paciente. Só é possível agendar com pacientes que já tiveram consulta com você.");
      return;
    }
    if (!newDate || !newTime) {
      setNewError("Selecione data e horário.");
      return;
    }

    const scheduledAt = new Date(`${newDate}T${newTime}:00`);
    if (scheduledAt.getTime() < Date.now()) {
      setNewError("Escolha uma data e horário no futuro.");
      return;
    }

    setCreating(true);

    const { data: conflict } = await supabase
      .from("appointments")
      .select("id")
      .eq("professional_id", currentUser.id)
      .eq("scheduled_at", scheduledAt.toISOString())
      .eq("status", "scheduled")
      .maybeSingle();

    if (conflict) {
      setCreating(false);
      setNewError("Você já tem uma consulta marcada nesse horário.");
      return;
    }

    const { data: profile } = await supabase.from("professional_profiles").select("session_price").eq("id", currentUser.id).maybeSingle();

    const { error } = await supabase.from("appointments").insert({
      patient_id: newPatientId,
      professional_id: currentUser.id,
      scheduled_at: scheduledAt.toISOString(),
      modality: newModality,
      price: Number(profile?.session_price ?? 0),
    });

    setCreating(false);

    if (error) {
      reportError(error, { flow: "calendar.createAppointment" });
      setNewError("Não foi possível criar a consulta.");
      return;
    }

    setShowNewModal(false);
    await reloadAppointments();
  };

  const handleConnectGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.events",
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo: `${window.location.origin}/profissional/agenda`,
      },
    });
  };

  const handleSyncGoogle = async () => {
    setGoogleSyncing(true);
    setGoogleMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.provider_token;

    if (!token) {
      setGoogleSyncing(false);
      setGoogleConnected(false);
      setGoogleMessage("Sua conexão com o Google expirou. Clique em \"Conectar Google Agenda\" de novo.");
      return;
    }

    const upcoming = appointments.filter(a => a.status === "scheduled" && new Date(a.scheduledAt) >= new Date());
    let successCount = 0;

    for (const appt of upcoming) {
      const start = new Date(appt.scheduledAt);
      const end = new Date(start.getTime() + appt.durationMinutes * 60000);
      const body = JSON.stringify({
        summary: `Consulta — ${appt.patientName}`,
        description: `Consulta MindCare (${appt.modality === "online" ? "Online" : "Presencial"})`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      });

      try {
        const url = appt.googleEventId
          ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.googleEventId}`
          : "https://www.googleapis.com/calendar/v3/calendars/primary/events";
        const res = await fetch(url, {
          method: appt.googleEventId ? "PATCH" : "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body,
        });

        if (res.ok) {
          successCount++;
          if (!appt.googleEventId) {
            const created = await res.json();
            await supabase.from("appointments").update({ google_event_id: created.id }).eq("id", appt.id);
          }
        }
      } catch (error) {
        reportError(error, { flow: "calendar.syncGoogle", appointmentId: appt.id });
      }
    }

    setGoogleSyncing(false);
    setGoogleMessage(`${successCount} de ${upcoming.length} consultas sincronizadas com o Google Agenda.`);
    if (successCount > 0) await reloadAppointments();
  };

  const monthList = appointments.slice().sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <AppShell title="Agenda & Calendário" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
      <div className="space-y-4 h-full">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              className="p-2 rounded-lg hover:bg-muted"
              onClick={() => setAnchorDate(d => {
                const next = new Date(d);
                if (view === "month") next.setMonth(next.getMonth() - 1);
                else next.setDate(next.getDate() - 7);
                return next;
              })}
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-semibold text-foreground font-display">
              {view === "month" ? anchorDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : formatWeekRangeLabel(weekStart)}
            </h2>
            <button
              className="p-2 rounded-lg hover:bg-muted"
              onClick={() => setAnchorDate(d => {
                const next = new Date(d);
                if (view === "month") next.setMonth(next.getMonth() + 1);
                else next.setDate(next.getDate() + 7);
                return next;
              })}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-xl p-1">
              {(["day", "week", "month"] as const).map(v => (
                <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${view === v ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}>{v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}</button>
              ))}
            </div>
            <Btn variant="primary" size="sm" onClick={() => openNewAppointmentModal()}><Plus size={15} />Nova consulta</Btn>
            {googleConnected ? (
              <Btn variant="outline" size="sm" onClick={handleSyncGoogle} disabled={googleSyncing}><RefreshCw size={15} />{googleSyncing ? "Sincronizando..." : "Sincronizar Google"}</Btn>
            ) : (
              <Btn variant="outline" size="sm" onClick={handleConnectGoogle}><RefreshCw size={15} />Conectar Google Agenda</Btn>
            )}
          </div>
        </div>
        {googleMessage && <p className="text-xs text-muted-foreground">{googleMessage}</p>}

        {(view === "week" || view === "day") && (
          <Card className="overflow-hidden flex-1">
            <div className="grid border-b border-border bg-muted/50" style={{ gridTemplateColumns: `60px repeat(${view === "day" ? 1 : 7}, 1fr)` }}>
              <div className="p-3" />
              {(view === "day" ? [weekDays.find(d => isSameDay(d, anchorDate)) ?? anchorDate] : weekDays).map(d => (
                <div key={d.toISOString()} className="p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground">{CALENDAR_DAY_LABELS[d.getDay()]}</p>
                  <p className={`text-sm font-semibold mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto ${isSameDay(d, new Date()) ? "bg-primary text-white" : "text-foreground"}`}>{d.getDate()}</p>
                </div>
              ))}
            </div>
            <div className="overflow-y-auto max-h-[480px]">
              {loadingAppointments && <p className="text-sm text-muted-foreground p-4">Carregando consultas...</p>}
              {!loadingAppointments && CALENDAR_HOURS.map(h => (
                <div key={h} className="grid border-b border-border/50 min-h-[60px]" style={{ gridTemplateColumns: `60px repeat(${view === "day" ? 1 : 7}, 1fr)` }}>
                  <div className="px-3 py-2 text-xs text-muted-foreground text-right font-mono">{h}:00</div>
                  {(view === "day" ? [weekDays.find(d => isSameDay(d, anchorDate)) ?? anchorDate] : weekDays).map(d => {
                    const appts = appointmentsFor(d, h);
                    return (
                      <div key={d.toISOString()} className="border-l border-border/30 p-1 relative cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => appts.length === 0 && openNewAppointmentModal(d, h)}>
                        {appts.map(a => (
                          <div
                            key={a.id}
                            onClick={e => { e.stopPropagation(); setSelectedAppointment(a); }}
                            className={`rounded-lg border px-2 py-1 text-xs font-medium ${a.status === "cancelled" ? "bg-muted border-border text-muted-foreground line-through" : a.modality === "online" ? "bg-primary/10 border-primary/30 text-primary" : "bg-blue-50 border-blue-200 text-blue-700"}`}
                          >
                            <p className="font-semibold truncate">{a.patientName}</p>
                            <p className="opacity-70">{a.modality === "online" ? "Online" : "Presencial"}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
        )}

        {view === "month" && (
          <Card className="p-4 flex-1 overflow-y-auto max-h-[560px]">
            {loadingAppointments && <p className="text-sm text-muted-foreground">Carregando consultas...</p>}
            {!loadingAppointments && monthList.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma consulta neste mês.</p>}
            <div className="divide-y divide-border">
              {monthList.map(a => (
                <div key={a.id} className="flex items-center justify-between py-3 cursor-pointer hover:bg-muted/30 px-2 rounded-lg" onClick={() => setSelectedAppointment(a)}>
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.scheduledAt).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · {new Date(a.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Badge variant={a.status === "completed" ? "success" : a.status === "cancelled" ? "danger" : "outline"}>
                    {a.status === "completed" ? "Concluída" : a.status === "cancelled" ? "Cancelada" : a.modality === "online" ? "Online" : "Presencial"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><Clock size={16} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Disponibilidade semanal</p>
              <p className="text-sm font-medium text-foreground truncate">{availabilitySummary}</p>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("professional-settings")}>Editar</Btn>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><RefreshCw size={16} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Google Agenda</p>
              <p className="text-sm font-medium text-foreground truncate">{googleConnected ? "Conectado" : "Não conectado"}</p>
            </div>
          </Card>
        </div>
      </div>

      {selectedAppointment && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setSelectedAppointment(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">{selectedAppointment.patientName}</h2>
              <button type="button" onClick={() => setSelectedAppointment(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {new Date(selectedAppointment.scheduledAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })} · {new Date(selectedAppointment.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-muted-foreground">{selectedAppointment.modality === "online" ? "Online" : "Presencial"}</p>
              <Badge variant={selectedAppointment.status === "completed" ? "success" : selectedAppointment.status === "cancelled" ? "danger" : "outline"}>
                {selectedAppointment.status === "completed" ? "Concluída" : selectedAppointment.status === "cancelled" ? "Cancelada" : "Agendada"}
              </Badge>
            </div>
            <div className="flex gap-2 mt-5 flex-wrap">
              <Btn variant="outline" onClick={() => { onOpenEhr(selectedAppointment.patientId, selectedAppointment.id); onNavigate("ehr"); }}>Ver prontuário</Btn>
              {selectedAppointment.modality === "online" && selectedAppointment.status === "scheduled" && (
                <Btn variant="primary" onClick={() => { onEnterVideo(selectedAppointment.id); onNavigate("video"); }}><Video size={14} />Entrar</Btn>
              )}
              {selectedAppointment.status === "scheduled" && (
                <Btn variant="danger" disabled={cancelling} onClick={handleCancelAppointment}>{cancelling ? "Cancelando..." : "Cancelar consulta"}</Btn>
              )}
            </div>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowNewModal(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">Nova consulta</h2>
              <button type="button" onClick={() => setShowNewModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            {patients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Você ainda não tem nenhum paciente. Novos pacientes agendam a primeira consulta pelo diretório público — depois disso você pode marcar consultas de retorno por aqui.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Paciente</label>
                  <select value={newPatientId} onChange={e => setNewPatientId(e.target.value)} className="px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Data</label>
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Horário</label>
                    <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Modalidade</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setNewModality("online")} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${newModality === "online" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>Online</button>
                    <button type="button" onClick={() => setNewModality("presencial")} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${newModality === "presencial" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>Presencial</button>
                  </div>
                </div>
                {newError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{newError}</div>}
                <Btn variant="primary" className="w-full justify-center" onClick={handleCreateAppointment} disabled={creating}>{creating ? "Criando..." : "Criar consulta"}</Btn>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── SCREEN: EHR ─────────────────────────────────────────────────────────────

type EhrPatient = { id: string; name: string; img: string; sessionsCount: number };
type EhrSession = { id: string; scheduledAt: string; modality: string; status: string; notes: string; aiSummary: string | null };

function EHRScreen({ onNavigate, currentUser, onSignOut, initialPatientId, initialAppointmentId }: AuthenticatedScreenProps & { initialPatientId?: string | null; initialAppointmentId?: string | null }) {
  const [patientSearch, setPatientSearch] = useState("");
  const [ehrTab, setEhrTab] = useState<"historico" | "notas">("historico");
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("ehr") },
    { icon: <FileText size={18} />, label: "Prontuários", active: true, onClick: () => onNavigate("ehr") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [patients, setPatients] = useState<EhrPatient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<EhrSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      setLoadingPatients(true);
      const { data } = await supabase
        .from("appointments")
        .select("patient_id, profiles(full_name, avatar_url)")
        .eq("professional_id", currentUser.id);

      if (!active) return;

      const map = new Map<string, EhrPatient>();
      ((data ?? []) as any[]).forEach(a => {
        const existing = map.get(a.patient_id);
        if (existing) existing.sessionsCount += 1;
        else map.set(a.patient_id, { id: a.patient_id, name: a.profiles?.full_name ?? "Paciente", img: a.profiles?.avatar_url ?? "", sessionsCount: 1 });
      });
      const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      setPatients(list);
      setSelectedPatientId(prev => prev ?? initialPatientId ?? list[0]?.id ?? null);
      setLoadingPatients(false);
    })();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (!selectedPatientId) {
      setSessions([]);
      setSelectedSessionId(null);
      return;
    }

    let active = true;
    setLoadingSessions(true);
    setSaveMessage("");

    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, modality, status, session_notes(notes, ai_summary)")
        .eq("professional_id", currentUser.id)
        .eq("patient_id", selectedPatientId)
        .order("scheduled_at", { ascending: false });

      if (!active) return;

      const rows: EhrSession[] = ((data ?? []) as any[]).map(a => {
        const note = Array.isArray(a.session_notes) ? a.session_notes[0] : a.session_notes;
        return {
          id: a.id,
          scheduledAt: a.scheduled_at,
          modality: a.modality,
          status: a.status,
          notes: note?.notes ?? "",
          aiSummary: note?.ai_summary ?? null,
        };
      });
      setSessions(rows);
      const preselected = initialAppointmentId && rows.some(r => r.id === initialAppointmentId) ? rows.find(r => r.id === initialAppointmentId)! : rows[0];
      setSelectedSessionId(preselected?.id ?? null);
      setNotesDraft(preselected?.notes ?? "");
      setLoadingSessions(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedPatientId, currentUser.id]);

  const selectSession = (id: string) => {
    setSelectedSessionId(id);
    setNotesDraft(sessions.find(s => s.id === id)?.notes ?? "");
    setSaveMessage("");
  };

  const handleSaveNotes = async () => {
    if (!selectedSessionId) return;
    setSaving(true);
    setSaveMessage("");

    const { error } = await supabase
      .from("session_notes")
      .upsert(
        { appointment_id: selectedSessionId, professional_id: currentUser.id, notes: notesDraft },
        { onConflict: "appointment_id" }
      );

    setSaving(false);

    if (error) {
      setSaveMessage("Não foi possível salvar a nota.");
      return;
    }

    setSessions(prev => prev.map(s => (s.id === selectedSessionId ? { ...s, notes: notesDraft } : s)));
    setSaveMessage("Nota salva com segurança.");
  };

  const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(patientSearch.trim().toLowerCase()));
  const selectedPatient = patients.find(p => p.id === selectedPatientId) ?? null;
  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null;

  return (
    <AppShell title="Prontuário Eletrônico" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
      <div className="flex gap-6 h-full">
        {/* Patient list */}
        <div className="w-64 flex-shrink-0">
          <div className="mb-3">
            <Input placeholder="Buscar paciente..." icon={<Search size={15} />} value={patientSearch} onChange={setPatientSearch} />
          </div>
          {loadingPatients && <p className="text-xs text-muted-foreground">Carregando pacientes...</p>}
          {!loadingPatients && filteredPatients.length === 0 && <p className="text-xs text-muted-foreground">Nenhum paciente encontrado.</p>}
          <div className="space-y-2">
            {filteredPatients.map(pt => (
              <button key={pt.id} onClick={() => setSelectedPatientId(pt.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${selectedPatientId === pt.id ? "bg-secondary border border-border" : "hover:bg-muted"}`}>
                <Avatar name={pt.name} src={pt.img || undefined} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{pt.name}</p>
                  <p className="text-xs text-muted-foreground">{pt.sessionsCount} sessões</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Patient record */}
        <div className="flex-1 space-y-4">
          {!selectedPatient ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Você ainda não tem pacientes com consultas registradas.</Card>
          ) : (
            <>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <Avatar name={selectedPatient.name} src={selectedPatient.img || undefined} size="lg" />
                    <div>
                      <h2 className="font-bold text-foreground font-display">{selectedPatient.name}</h2>
                      <p className="text-sm text-muted-foreground">{selectedPatient.sessionsCount} sessões registradas</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 border-t border-border pt-3">
                  {(["historico", "notas"] as const).map(t => (
                    <button key={t} onClick={() => setEhrTab(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${ehrTab === t ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                      {t === "historico" ? "Histórico" : "Notas Seguras"}
                    </button>
                  ))}
                </div>
              </Card>

              {ehrTab === "historico" && (
                <div className="space-y-3">
                  {loadingSessions && <p className="text-sm text-muted-foreground">Carregando sessões...</p>}
                  {!loadingSessions && sessions.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma sessão registrada com este paciente.</Card>}
                  {sessions.map(s => (
                    <Card key={s.id} className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                            {s.modality === "online" ? <Video size={16} /> : <MapPin size={16} />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {new Date(s.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                            <Badge variant="outline">{s.modality === "online" ? "Online" : "Presencial"}</Badge>
                          </div>
                        </div>
                        <Badge variant={s.status === "completed" ? "success" : s.status === "cancelled" ? "danger" : "outline"}>
                          {s.status === "completed" ? "Concluída" : s.status === "cancelled" ? "Cancelada" : "Agendada"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{s.notes || "Nenhuma nota clínica registrada para esta sessão ainda."}</p>
                      <div className="flex gap-2 mt-3">
                        <Btn variant="ghost" size="sm" onClick={() => { selectSession(s.id); setEhrTab("notas"); }}><Edit3 size={13} />Editar nota</Btn>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {ehrTab === "notas" && (
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Lock size={16} className="text-amber-600" />
                    <h3 className="font-semibold text-foreground font-display">Notas Seguras</h3>
                    <Badge variant="warning">Visível apenas por você</Badge>
                  </div>
                  {sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Este paciente ainda não tem sessões para anotar.</p>
                  ) : (
                    <>
                      <select
                        value={selectedSessionId ?? ""}
                        onChange={e => selectSession(e.target.value)}
                        className="mb-4 px-3 py-2 bg-input-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {sessions.map(s => (
                          <option key={s.id} value={s.id}>
                            {new Date(s.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={notesDraft}
                        onChange={e => setNotesDraft(e.target.value)}
                        className="w-full h-40 p-3 bg-input-background border border-border rounded-xl text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                        placeholder="Adicione notas clínicas seguras sobre esta sessão. Elas são visíveis apenas por você."
                      />
                      {selectedSession?.aiSummary && (
                        <div className="mt-3 p-3 bg-secondary rounded-xl text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Resumo de IA: </span>{selectedSession.aiSummary}
                        </div>
                      )}
                      {saveMessage && <p className={`text-xs mt-2 ${saveMessage.includes("não") ? "text-red-600" : "text-emerald-600"}`}>{saveMessage}</p>}
                      <div className="flex justify-end mt-3">
                        <Btn variant="primary" size="sm" onClick={handleSaveNotes} disabled={saving}><Lock size={13} />{saving ? "Salvando..." : "Salvar com segurança"}</Btn>
                      </div>
                    </>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ─── SCREEN: AI Assistant ─────────────────────────────────────────────────────

function AIAssistantScreen({ onNavigate, currentUser, onSignOut }: AuthenticatedScreenProps) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("ehr") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <Brain size={18} />, label: "IA Assistente", active: true, onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [patients, setPatients] = useState<EhrPatient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<EhrSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const [aiConsent, setAiConsent] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState<AISessionSummary | null>(null);

  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      setLoadingPatients(true);
      const { data } = await supabase
        .from("appointments")
        .select("patient_id, profiles(full_name, avatar_url)")
        .eq("professional_id", currentUser.id);

      if (!active) return;

      const map = new Map<string, EhrPatient>();
      ((data ?? []) as any[]).forEach(a => {
        const existing = map.get(a.patient_id);
        if (existing) existing.sessionsCount += 1;
        else map.set(a.patient_id, { id: a.patient_id, name: a.profiles?.full_name ?? "Paciente", img: a.profiles?.avatar_url ?? "", sessionsCount: 1 });
      });
      const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      setPatients(list);
      setSelectedPatientId(prev => prev ?? list[0]?.id ?? null);
      setLoadingPatients(false);
    })();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (!selectedPatientId) {
      setSessions([]);
      setSelectedSessionId(null);
      return;
    }

    let active = true;
    setLoadingSessions(true);
    setAiResult(null);
    setAiError("");
    setAiConsent(false);
    setSaveMessage("");

    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, modality, status, session_notes(notes, ai_summary)")
        .eq("professional_id", currentUser.id)
        .eq("patient_id", selectedPatientId)
        .order("scheduled_at", { ascending: false });

      if (!active) return;

      const rows: EhrSession[] = ((data ?? []) as any[]).map(a => {
        const note = Array.isArray(a.session_notes) ? a.session_notes[0] : a.session_notes;
        return {
          id: a.id,
          scheduledAt: a.scheduled_at,
          modality: a.modality,
          status: a.status,
          notes: note?.notes ?? "",
          aiSummary: note?.ai_summary ?? null,
        };
      });
      setSessions(rows);
      setSelectedSessionId(rows[0]?.id ?? null);
      setNotesDraft(rows[0]?.notes ?? "");
      setLoadingSessions(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedPatientId, currentUser.id]);

  const selectSession = (id: string) => {
    setSelectedSessionId(id);
    setNotesDraft(sessions.find(s => s.id === id)?.notes ?? "");
    setAiResult(null);
    setAiError("");
    setAiConsent(false);
    setSaveMessage("");
  };

  const dictationSupported = typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const toggleDictation = () => {
    if (!dictationSupported) return;
    if (dictating) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript;
      if (text) setNotesDraft(prev => (prev ? `${prev} ${text}` : text));
    };
    recognition.onend = () => setDictating(false);
    recognitionRef.current = recognition;
    recognition.start();
    setDictating(true);
  };

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  const handleGenerateSummary = async () => {
    if (!selectedSessionId || !notesDraft.trim()) return;
    setAiLoading(true);
    setAiError("");
    const result = await getAISessionSummary(selectedSessionId, notesDraft);
    setAiLoading(false);
    if (!result) {
      setAiResult(null);
      setAiError("IA indisponível no momento. Você pode continuar escrevendo suas notas manualmente.");
      return;
    }
    setAiResult(result);
  };

  const handleUseSuggestedNote = () => {
    if (!aiResult) return;
    setNotesDraft(prev => (prev.trim() ? `${prev}\n\n${aiResult.clinicalNote}` : aiResult.clinicalNote));
  };

  const handleSaveNotes = async () => {
    if (!selectedSessionId) return;
    setSaving(true);
    setSaveMessage("");

    // Consent already gated sending the text to Gemini when the summary was generated — re-requiring
    // it here too just meant the AI content silently vanished from the save if the checkbox state
    // changed (or was simply unchecked) by the time "Salvar" was clicked, with no warning shown.
    // Persisting a result we already generated needs no second consent check.
    const aiFields = aiResult
      ? { ai_summary: formatAiSummaryText(aiResult), ai_summary_generated_at: new Date().toISOString() }
      : {};

    const { error } = await supabase
      .from("session_notes")
      .upsert(
        { appointment_id: selectedSessionId, professional_id: currentUser.id, notes: notesDraft, ...aiFields },
        { onConflict: "appointment_id" }
      );

    setSaving(false);

    if (error) {
      reportError(error, { flow: "aiAssistant.saveNotes" });
      setSaveMessage("Não foi possível salvar a nota.");
      return;
    }

    setSessions(prev => prev.map(s => (s.id === selectedSessionId ? {
      ...s,
      notes: notesDraft,
      aiSummary: aiResult ? formatAiSummaryText(aiResult) : s.aiSummary,
    } : s)));
    setSaveMessage("Nota salva com segurança.");
  };

  return (
    <AppShell title="IA Assistente Clínico" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
      {loadingPatients ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : patients.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Você ainda não tem consultas registradas. Assim que tiver pacientes, poderá escrever notas de sessão aqui e gerar um resumo com IA.
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 h-full">
          {/* Notes panel */}
          <div className="space-y-4">
            <Card className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground font-display">Selecionar sessão</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Paciente</label>
                  <select
                    value={selectedPatientId ?? ""}
                    onChange={e => setSelectedPatientId(e.target.value || null)}
                    className="px-3 py-2 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sessão</label>
                  <select
                    value={selectedSessionId ?? ""}
                    onChange={e => selectSession(e.target.value)}
                    disabled={loadingSessions || sessions.length === 0}
                    className="px-3 py-2 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.scheduledAt).toLocaleDateString("pt-BR")} · {s.modality === "online" ? "Online" : "Presencial"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {loadingSessions && <p className="text-xs text-muted-foreground">Carregando sessões...</p>}
              {!loadingSessions && sessions.length === 0 && <p className="text-xs text-muted-foreground">Este paciente ainda não tem consultas.</p>}
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground font-display">Notas da sessão</h3>
                {dictationSupported && (
                  <button
                    type="button"
                    onClick={toggleDictation}
                    disabled={!selectedSessionId}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${dictating ? "bg-red-500 text-white animate-pulse" : "bg-muted text-foreground hover:bg-secondary"}`}
                  >
                    {dictating ? <MicOff size={13} /> : <Mic size={13} />}{dictating ? "Parar ditado" : "Ditar por voz"}
                  </button>
                )}
              </div>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                disabled={!selectedSessionId}
                placeholder="Escreva (ou dite) suas anotações sobre a sessão..."
                className="w-full h-56 p-3 bg-input-background border border-border rounded-xl text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />

              <label className="flex items-start gap-2 text-xs text-muted-foreground mt-3">
                <input type="checkbox" checked={aiConsent} onChange={e => setAiConsent(e.target.checked)} className="mt-0.5" />
                Autorizo o envio do texto acima (nunca áudio) para o Google (Gemini, IA) gerar um resumo. O texto pode conter dados identificáveis do paciente se você os escrever.
              </label>

              <Btn
                variant="primary"
                className="w-full justify-center mt-3"
                disabled={!aiConsent || !notesDraft.trim() || aiLoading || !selectedSessionId}
                onClick={handleGenerateSummary}
              >
                <Zap size={15} />{aiLoading ? "Analisando com IA..." : "Gerar resumo com IA"}
              </Btn>
              {aiError && (
                <p className="text-xs text-amber-700 mt-2 flex items-start gap-1.5"><AlertCircle size={13} className="flex-shrink-0 mt-0.5" />{aiError}</p>
              )}
            </Card>
          </div>

          {/* AI review + save panel */}
          <div className="space-y-4">
            {aiResult ? (
              <>
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><Zap size={16} /></div>
                    <h3 className="font-semibold text-foreground font-display">Resumo sugerido pela IA</h3>
                  </div>
                  {aiResult.keyPoints.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pontos-chave</p>
                      <ul className="space-y-2">
                        {aiResult.keyPoints.map((p, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground"><Check size={14} className="text-primary flex-shrink-0 mt-0.5" />{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiResult.actionItems.length > 0 && (
                    <div className="border-t border-border pt-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Itens de ação</p>
                      <ul className="space-y-2">
                        {aiResult.actionItems.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground"><div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiResult.keyPoints.length === 0 && aiResult.actionItems.length === 0 && (
                    <p className="text-sm text-muted-foreground">A IA não identificou pontos-chave ou ações a partir do texto enviado.</p>
                  )}
                </Card>

                <Card className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground font-display">Nota clínica sugerida</h3>
                    <Badge variant="success"><Brain size={11} />Gerada por IA</Badge>
                  </div>
                  <div className="bg-muted rounded-xl p-4 mb-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">{aiResult.clinicalNote || "—"}</p>
                  </div>
                  <Btn variant="outline" size="sm" className="w-full justify-center" onClick={handleUseSuggestedNote}>
                    <Edit3 size={13} />Usar nota sugerida (adicionar ao texto)
                  </Btn>
                </Card>
              </>
            ) : (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                <Zap size={22} className="mx-auto mb-2 text-muted-foreground/50" />
                Escreva suas notas e clique em "Gerar resumo com IA" para ver pontos-chave, itens de ação e uma nota clínica sugerida aqui.
              </Card>
            )}

            <Card className="p-5">
              <h3 className="font-semibold text-foreground font-display mb-3">Salvar no prontuário</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Salva o texto acima na nota desta sessão (a mesma exibida no prontuário) — junto com o resumo de IA, se você gerou um nesta sessão de edição.
              </p>
              <div className="flex gap-2">
                <Btn variant="primary" className="flex-1 justify-center" disabled={!selectedSessionId || saving} onClick={handleSaveNotes}>
                  <FileText size={14} />{saving ? "Salvando..." : "Salvar no prontuário"}
                </Btn>
                <Btn variant="outline" onClick={() => onNavigate("ehr")}>Ver prontuário</Btn>
              </div>
              {saveMessage && <p className="text-xs text-emerald-700 mt-2">{saveMessage}</p>}
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── SCREEN: Video Consultation ───────────────────────────────────────────────

type VideoAppointment = {
  otherPartyName: string;
  scheduledAt: string;
  roomUrl: string | null;
};

function LiveKitCallFrame({ serverUrl, token, currentUserName, otherPartyName, onLeave }: {
  serverUrl: string;
  token: string;
  currentUserName: string;
  otherPartyName: string;
  onLeave: () => void;
}) {
  const roomRef = useRef<import("livekit-client").Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState<{ from: string; text: string; time: string }[]>([]);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [connectError, setConnectError] = useState("");

  const nowLabel = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    let destroyed = false;

    // Loaded on demand — livekit-client is a sizable dependency only ever needed on this screen.
    void (async () => {
      const { Room, RoomEvent, Track } = await import("livekit-client");
      if (destroyed) return;

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (participant.isLocal) return;
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) track.attach(remoteVideoRef.current);
        if (track.kind === Track.Kind.Audio && remoteAudioRef.current) track.attach(remoteAudioRef.current);
        setRemoteJoined(true);
      });

      room.on(RoomEvent.TrackUnsubscribed, track => track.detach());
      room.on(RoomEvent.ParticipantDisconnected, () => setRemoteJoined(false));

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          setMessages(prev => [...prev, { from: participant?.name || otherPartyName, text: data.text, time: nowLabel() }]);
        } catch {
          // Ignore malformed data-channel payloads — chat is a nice-to-have, not worth crashing the call.
        }
      });

      room.on(RoomEvent.Disconnected, () => { if (!destroyed) onLeave(); });

      try {
        await room.connect(serverUrl, token);
        if (destroyed) { room.disconnect(); return; }
        await room.localParticipant.setMicrophoneEnabled(true);
        const camPub = await room.localParticipant.setCameraEnabled(true);
        if (camPub?.track && localVideoRef.current) camPub.track.attach(localVideoRef.current);
        setRemoteJoined(room.remoteParticipants.size > 0);
      } catch (error) {
        if (!destroyed) setConnectError(error instanceof Error ? error.message : "Não foi possível conectar à sala.");
      }
    })();

    return () => {
      destroyed = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [serverUrl, token]);

  const toggleMic = async () => {
    const next = !micOn;
    setMicOn(next);
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
  };

  const toggleCam = async () => {
    const next = !camOn;
    setCamOn(next);
    const pub = await roomRef.current?.localParticipant.setCameraEnabled(next);
    if (next && pub?.track && localVideoRef.current) pub.track.attach(localVideoRef.current);
  };

  const toggleScreenShare = async () => {
    const next = !screenOn;
    setScreenOn(next);
    await roomRef.current?.localParticipant.setScreenShareEnabled(next);
  };

  const sendMessage = () => {
    if (!msg.trim() || !roomRef.current) return;
    const payload = new TextEncoder().encode(JSON.stringify({ text: msg.trim() }));
    void roomRef.current.localParticipant.publishData(payload, { reliable: true });
    setMessages(prev => [...prev, { from: "Você", text: msg.trim(), time: nowLabel() }]);
    setMsg("");
  };

  const handleLeave = () => {
    roomRef.current?.disconnect();
    onLeave();
  };

  if (connectError) {
    return (
      <div className="h-screen bg-[#0D1117] flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h2 className="font-semibold text-foreground font-display mb-2">Não foi possível entrar na sala</h2>
          <p className="text-sm text-muted-foreground mb-4">{connectError}</p>
          <Btn variant="primary" onClick={onLeave}>Voltar</Btn>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0D1117] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 bg-[#161B22] border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center"><Brain size={14} className="text-white" /></div>
          <span className="text-white font-semibold text-sm font-display">MindCare · Videoconsulta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${remoteJoined ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <span className={`text-xs font-medium ${remoteJoined ? "text-green-400" : "text-amber-400"}`}>
            {remoteJoined ? `Sala com ${otherPartyName}` : `Aguardando ${otherPartyName}...`}
          </span>
        </div>
        <Badge variant="success">Criptografado</Badge>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative flex items-center justify-center p-6">
          <div className="w-full max-w-4xl aspect-video bg-[#1C2128] rounded-3xl overflow-hidden relative">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <audio ref={remoteAudioRef} autoPlay />
            {!remoteJoined && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-white/50 text-sm">Aguardando {otherPartyName} entrar...</p>
              </div>
            )}
            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${remoteJoined ? "bg-emerald-400" : "bg-white/30"}`} />
              <span className="text-white text-xs font-medium">{otherPartyName}</span>
            </div>
          </div>

          <div className="absolute bottom-10 right-10 w-44 aspect-video bg-[#1C2128] rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl">
            {camOn ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Avatar name={currentUserName} size="md" /></div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/50 rounded-lg px-2 py-0.5">
              <span className="text-white text-xs">Você</span>
            </div>
          </div>
        </div>

        {chatOpen && (
          <div className="w-72 bg-[#161B22] border-l border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-white text-sm font-semibold">Chat da sessão</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && <p className="text-xs text-white/30">Nenhuma mensagem ainda.</p>}
              {messages.map((m, i) => (
                <div key={i}>
                  <p className="text-xs text-white/40 mb-1">{m.from} · {m.time}</p>
                  <div className={`rounded-xl px-3 py-2 text-xs text-white leading-relaxed ${m.from === "Você" ? "bg-primary ml-4" : "bg-white/10"}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
                  placeholder="Mensagem..."
                  className="flex-1 bg-white/10 text-white text-xs rounded-xl px-3 py-2 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button onClick={sendMessage} className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center"><Send size={14} className="text-white" /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-5 bg-[#161B22] border-t border-white/10">
        <button onClick={() => void toggleMic()} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${micOn ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80"}`}>
          {micOn ? <Mic size={20} className="text-white" /> : <MicOff size={20} className="text-white" />}
        </button>
        <button onClick={() => void toggleCam()} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${camOn ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80"}`}>
          {camOn ? <Camera size={20} className="text-white" /> : <X size={20} className="text-white" />}
        </button>
        <button className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg transition-all" onClick={handleLeave}>
          <PhoneOff size={22} className="text-white" />
        </button>
        <button onClick={() => void toggleScreenShare()} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${screenOn ? "bg-primary" : "bg-white/10 hover:bg-white/20"}`}>
          <Monitor size={20} className="text-white" />
        </button>
        <button onClick={() => setChatOpen(!chatOpen)} className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center"><MessageSquare size={20} className="text-white" /></button>
      </div>
    </div>
  );
}

function VideoScreen({ onNavigate, currentUser, appointmentId }: {
  onNavigate: (s: Screen) => void;
  currentUser: AppUser;
  appointmentId: string | null;
}) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [msg, setMsg] = useState("");
  const [appointment, setAppointment] = useState<VideoAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [liveKitAccess, setLiveKitAccess] = useState<LiveKitRoomAccess | null>(null);

  const exitScreen: Screen = currentUser.role === "professional" ? "pro-dashboard" : "patient-dashboard";

  useEffect(() => {
    if (!appointmentId) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError("");

    (async () => {
      const { data: appt, error } = await supabase
        .from("appointments")
        .select("id, scheduled_at, profiles(full_name), professional_profiles(profiles(full_name))")
        .eq("id", appointmentId)
        .maybeSingle();

      if (!active) return;

      if (error || !appt) {
        setLoadError("Não foi possível carregar esta consulta.");
        setLoading(false);
        return;
      }

      const item: any = appt;
      const otherPartyName = currentUser.role === "professional"
        ? item.profiles?.full_name ?? "Paciente"
        : item.professional_profiles?.profiles?.full_name ?? "Profissional";

      // Tries LiveKit first (real video); falls back to the mock room below if it's not configured.
      const access = await getLiveKitRoomAccess(appointmentId);
      if (!active) return;
      setLiveKitAccess(access);

      let { data: room } = await supabase
        .from("video_rooms")
        .select("room_url")
        .eq("appointment_id", appointmentId)
        .maybeSingle();

      if (!room && !access) {
        const roomId = `room-${appointmentId}`;
        const { data: createdRoom } = await supabase
          .from("video_rooms")
          .insert({ appointment_id: appointmentId, room_url: `https://meet.mindcare.test/${roomId}`, provider_room_id: roomId })
          .select("room_url")
          .maybeSingle();
        room = createdRoom ?? null;
      }

      if (!active) return;
      setAppointment({ otherPartyName, scheduledAt: item.scheduled_at, roomUrl: room?.room_url ?? null });
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [appointmentId, currentUser.role]);

  const messages = appointment ? [
    { from: appointment.otherPartyName, text: "Olá! Pode me ouvir bem?", time: new Date(appointment.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) },
  ] : [];

  if (!appointmentId) {
    return (
      <div className="h-screen bg-[#0D1117] flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h2 className="font-semibold text-foreground font-display mb-2">Nenhuma consulta selecionada</h2>
          <p className="text-sm text-muted-foreground mb-4">Entre em uma sala pelo painel de consultas.</p>
          <Btn variant="primary" onClick={() => onNavigate(exitScreen)}>Voltar ao painel</Btn>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <div className="h-screen bg-[#0D1117] flex items-center justify-center text-sm text-white/70">Entrando na sala...</div>;
  }

  if (loadError || !appointment) {
    return (
      <div className="h-screen bg-[#0D1117] flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h2 className="font-semibold text-foreground font-display mb-2">Sala indisponível</h2>
          <p className="text-sm text-muted-foreground mb-4">{loadError || "Esta consulta não foi encontrada."}</p>
          <Btn variant="primary" onClick={() => onNavigate(exitScreen)}>Voltar ao painel</Btn>
        </Card>
      </div>
    );
  }

  if (liveKitAccess) {
    return (
      <LiveKitCallFrame
        serverUrl={liveKitAccess.serverUrl}
        token={liveKitAccess.token}
        currentUserName={currentUser.fullName}
        otherPartyName={appointment.otherPartyName}
        onLeave={() => onNavigate(exitScreen)}
      />
    );
  }

  return (
    <div className="h-screen bg-[#0D1117] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#161B22] border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center"><Brain size={14} className="text-white" /></div>
          <span className="text-white font-semibold text-sm font-display">MindCare · Videoconsulta</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /><span className="text-green-400 text-xs font-medium">Sala com {appointment.otherPartyName}</span></div>
          <Badge variant="success">Criptografado</Badge>
          {appointment.roomUrl && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(appointment.roomUrl!)}
              className="text-xs text-white/50 hover:text-white/80 transition-colors underline decoration-dotted"
              title={appointment.roomUrl}
            >
              Copiar link da sala
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10" onClick={() => setChatOpen(!chatOpen)}>
            <MessageSquare size={16} />Chat
          </Btn>
          <Btn variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10">
            <Monitor size={16} />Compartilhar tela
          </Btn>
          <Btn variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10">
            <Upload size={16} />Enviar arquivo
          </Btn>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className="flex-1 relative flex items-center justify-center p-6">
          {/* Main video */}
          <div className="w-full max-w-4xl aspect-video bg-[#1C2128] rounded-3xl overflow-hidden relative">
            <img
              src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=900&h=500&fit=crop&auto=format"
              alt="Terapeuta em videochamada"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full" />
              <span className="text-white text-xs font-medium">{appointment.otherPartyName}</span>
            </div>
          </div>

          {/* Self video */}
          <div className="absolute bottom-10 right-10 w-44 aspect-video bg-[#1C2128] rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl">
            {camOn ? (
              <img src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=120&fit=crop&auto=format" alt="Você" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Avatar name={currentUser.fullName} size="md" /></div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/50 rounded-lg px-2 py-0.5">
              <span className="text-white text-xs">Você</span>
            </div>
          </div>
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div className="w-72 bg-[#161B22] border-l border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-white text-sm font-semibold">Chat da sessão</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i}>
                  <p className="text-xs text-white/40 mb-1">{m.from} · {m.time}</p>
                  <div className={`rounded-xl px-3 py-2 text-xs text-white leading-relaxed ${m.from === "Ana" ? "bg-primary ml-4" : "bg-white/10"}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-2">
                <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Mensagem..." className="flex-1 bg-white/10 text-white text-xs rounded-xl px-3 py-2 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary" />
                <button className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center"><Send size={14} className="text-white" /></button>
              </div>
              <button className="mt-2 w-full flex items-center justify-center gap-2 text-white/50 text-xs hover:text-white/80 transition-colors">
                <Paperclip size={12} />Enviar arquivo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 py-5 bg-[#161B22] border-t border-white/10">
        <button onClick={() => setMicOn(!micOn)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${micOn ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80"}`}>
          {micOn ? <Mic size={20} className="text-white" /> : <MicOff size={20} className="text-white" />}
        </button>
        <button onClick={() => setCamOn(!camOn)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${camOn ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80"}`}>
          {camOn ? <Camera size={20} className="text-white" /> : <X size={20} className="text-white" />}
        </button>
        <button className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg transition-all" onClick={() => onNavigate(exitScreen)}>
          <PhoneOff size={22} className="text-white" />
        </button>
        <button className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center"><Monitor size={20} className="text-white" /></button>
        <button className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center"><MoreHorizontal size={20} className="text-white" /></button>
      </div>
    </div>
  );
}

// ─── SCREEN: Pricing ──────────────────────────────────────────────────────────

function PricingPage({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [annual, setAnnual] = useState(false);
  const plans = [
    { name: "Essencial", price: annual ? 79 : 99, color: "border-border", features: ["5 pacientes ativos", "Agenda + lembretes", "Videochamada HD", "Prontuário básico", "Suporte por e-mail"], notIncluded: ["IA de sessão", "Receituário digital", "API", "Dashboard financeiro avançado"] },
    { name: "Profissional", price: annual ? 159 : 199, color: "ring-2 ring-primary", highlight: true, features: ["Pacientes ilimitados", "IA de sessão completa", "Prontuário com IA", "Receituário digital", "Dashboard financeiro", "Repasse automático", "Suporte prioritário 24h"], notIncluded: ["Múltiplos profissionais", "API de integração", "SLA garantido"] },
    { name: "Clínica", price: annual ? 399 : 499, color: "border-border", features: ["Tudo do Profissional", "Até 20 profissionais", "Painel admin da clínica", "API REST completa", "Relatórios avançados + BI", "SLA 99.9% garantido", "Gerente de conta dedicado", "Treinamento da equipe"], notIncluded: [] },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <Badge variant="success" className="mb-4">Para profissionais</Badge>
          <h1 className="text-4xl font-bold text-foreground font-display mb-4">Preços simples, sem surpresas</h1>
          <p className="text-muted-foreground mb-6">Comece com 14 dias grátis. Sem cartão de crédito.</p>
          <div className="flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Mensal</span>
            <button onClick={() => setAnnual(!annual)} className={`w-12 h-6 rounded-full transition-colors ${annual ? "bg-primary" : "bg-muted"} relative`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${annual ? "translate-x-7" : "translate-x-1"}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>Anual <Badge variant="success">Economize 20%</Badge></span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {plans.map((p, i) => (
            <Card key={i} className={`p-8 flex flex-col relative ${p.color}`}>
              {p.highlight && <Badge variant="success" className="absolute -top-3 left-1/2 -translate-x-1/2">Mais escolhido</Badge>}
              <h2 className="text-xl font-bold text-foreground font-display mb-1">{p.name}</h2>
              <div className="mb-6 mt-2">
                <span className="text-4xl font-bold text-foreground font-display">R${p.price}</span>
                <span className="text-muted-foreground">/mês</span>
                {annual && <p className="text-xs text-emerald-600 mt-1">Cobrado anualmente (R${p.price * 12}/ano)</p>}
              </div>
              <div className="flex-1 space-y-2 mb-6">
                {p.features.map((f, j) => <div key={j} className="flex items-center gap-2 text-sm text-foreground"><Check size={15} className="text-primary" />{f}</div>)}
                {p.notIncluded.map((f, j) => <div key={j} className="flex items-center gap-2 text-sm text-muted-foreground"><X size={15} className="text-muted-foreground/50" />{f}</div>)}
              </div>
              <Btn variant={p.highlight ? "primary" : "outline"} className="w-full justify-center" onClick={() => onNavigate("checkout")}>
                Começar grátis por 14 dias
              </Btn>
            </Card>
          ))}
        </div>

        <Card className="p-8">
          <h2 className="text-xl font-bold text-foreground font-display mb-6 text-center">Compare todos os recursos</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 font-medium text-muted-foreground w-1/2">Recurso</th>
                  {["Essencial", "Profissional", "Clínica"].map(n => <th key={n} className="text-center py-3 font-semibold text-foreground">{n}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Pacientes ativos", "5", "Ilimitado", "Ilimitado"],
                  ["Videochamada HD", "✓", "✓", "✓"],
                  ["IA de sessão", "—", "✓", "✓"],
                  ["Prontuário eletrônico", "Básico", "Completo", "Completo"],
                  ["Receituário digital", "—", "✓", "✓"],
                  ["Dashboard financeiro", "—", "✓", "✓ Avançado"],
                  ["Múltiplos profissionais", "—", "—", "Até 20"],
                  ["API de integração", "—", "—", "✓"],
                  ["SLA garantido", "—", "—", "99.9%"],
                ].map(([feat, ...vals], i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-3 text-foreground">{feat}</td>
                    {vals.map((v, j) => (
                      <td key={j} className="py-3 text-center text-muted-foreground">
                        {v === "✓" ? <Check size={16} className="text-primary mx-auto" /> : v === "—" ? <X size={14} className="text-muted-foreground/30 mx-auto" /> : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── SCREEN: Checkout ─────────────────────────────────────────────────────────

function CheckoutScreen({ onNavigate, currentUser, bookingDraft }: {
  onNavigate: (s: Screen) => void;
  currentUser: AppUser;
  bookingDraft: BookingDraft | null;
}) {
  const [payMethod, setPayMethod] = useState<"pix" | "card" | "sub">("card");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [checkoutError, setCheckoutError] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState(currentUser.email);
  const [phone, setPhone] = useState("");

  if (!bookingDraft) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h2 className="font-semibold text-foreground font-display mb-2">Nenhuma sessão selecionada</h2>
          <p className="text-sm text-muted-foreground mb-4">Escolha um profissional e um horário disponível antes de ir ao checkout.</p>
          <Btn variant="primary" onClick={() => onNavigate("directory")}>Ver diretório</Btn>
        </Card>
      </div>
    );
  }

  const scheduledDate = new Date(bookingDraft.scheduledAt);
  const scheduledLabel = `${scheduledDate.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · ${scheduledDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  const handlePersonalDataSubmit = () => {
    if (!fullName.trim() || !cpf.trim() || !email.trim() || !phone.trim()) {
      setCheckoutError("Preencha todos os campos para continuar.");
      return;
    }
    setCheckoutError("");
    setStep(2);
  };

  const handlePayment = async () => {
    setCheckoutError("");
    setProcessingPayment(true);

    try {
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("professional_id", bookingDraft.professionalId)
        .eq("scheduled_at", bookingDraft.scheduledAt)
        .eq("status", "scheduled")
        .maybeSingle();

      if (conflict) {
        throw new Error("Esse horário acabou de ser reservado por outro paciente. Volte ao perfil e escolha outro horário.");
      }

      const { data: appointment, error: appointmentError } = await supabase
        .from("appointments")
        .insert({
          patient_id: currentUser.id,
          professional_id: bookingDraft.professionalId,
          scheduled_at: bookingDraft.scheduledAt,
          modality: "online",
          price: bookingDraft.price,
        })
        .select("id")
        .single();

      if (appointmentError) throw appointmentError;

      // Real payment path: redirect to Mercado Pago's hosted checkout. The webhook (not this
      // redirect) is what actually confirms payment — see supabase/functions/mercadopago-webhook.
      const mpCheckoutUrl = await createMercadoPagoCheckout(appointment.id);
      if (mpCheckoutUrl) {
        window.location.href = mpCheckoutUrl;
        return;
      }

      // Fallback: Mercado Pago isn't configured yet, so simulate an instant successful charge.
      await mockPaymentProvider.charge({
        appointmentId: appointment.id,
        amount: bookingDraft.price,
        method: payMethod === "pix" ? "pix" : "card",
      });

      const roomId = `room-${appointment.id}`;
      // Best-effort: neither the video room nor the confirmation e-mail should block a paid booking.
      await supabase.from("video_rooms").insert({
        appointment_id: appointment.id,
        room_url: `https://meet.mindcare.test/${roomId}`,
        provider_room_id: roomId,
      });
      void supabase.functions.invoke("send-booking-confirmation", { body: { appointmentId: appointment.id } });

      setStep(3);
    } catch (error) {
      reportError(error, { flow: "checkout.handlePayment", professionalId: bookingDraft.professionalId });
      setCheckoutError(error instanceof Error ? error.message : "Não foi possível concluir o pagamento.");
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center"><Brain size={16} className="text-white" /></div>
          <span className="font-bold text-foreground font-display">MindCare</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">Checkout seguro</span>
          <Lock size={14} className="text-primary ml-auto" />
          <span className="text-xs text-muted-foreground">SSL 256-bit</span>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Form */}
          <div className="lg:col-span-3 space-y-6">
            {/* Steps */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>{step > s ? <Check size={13} /> : s}</div>
                  {s < 3 && <div className={`h-px w-16 ${step > s ? "bg-primary" : "bg-border"}`} />}
                </div>
              ))}
              <span className="text-xs text-muted-foreground ml-2">{["Dados pessoais", "Pagamento", "Confirmação"][step - 1]}</span>
            </div>

            {step === 1 && (
              <Card className="p-6 space-y-4">
                <h2 className="font-semibold text-foreground font-display">Seus dados</h2>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Nome completo" placeholder="Ana Beatriz" value={fullName} onChange={setFullName} />
                  <Input label="CPF" placeholder="000.000.000-00" value={cpf} onChange={setCpf} />
                </div>
                <Input label="E-mail" placeholder="ana@email.com" type="email" value={email} onChange={setEmail} />
                <Input label="Telefone" placeholder="(11) 99999-9999" icon={<PhoneIcon size={15} />} value={phone} onChange={setPhone} />
                {checkoutError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {checkoutError}
                  </div>
                )}
                <Btn variant="primary" className="w-full justify-center" onClick={handlePersonalDataSubmit}>Continuar <ChevronRight size={16} /></Btn>
              </Card>
            )}

            {step === 2 && (
              <Card className="p-6 space-y-4">
                <h2 className="font-semibold text-foreground font-display">Forma de pagamento</h2>
                <div className="grid grid-cols-3 gap-3">
                  {[{ id: "card" as const, label: "Cartão", icon: <CreditCard size={18} /> }, { id: "pix" as const, label: "Pix", icon: <Zap size={18} /> }, { id: "sub" as const, label: "Assinatura", icon: <RefreshCw size={18} /> }].map(m => (
                    <button key={m.id} onClick={() => setPayMethod(m.id)}
                      className={`py-3 rounded-xl border text-sm font-medium flex flex-col items-center gap-1.5 transition-all ${payMethod === m.id ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                      {m.icon}{m.label}
                    </button>
                  ))}
                </div>

                {payMethod === "card" && (
                  <div className="space-y-3">
                    <Input label="Número do cartão" placeholder="0000 0000 0000 0000" icon={<CreditCard size={15} />} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Validade" placeholder="MM/AA" />
                      <Input label="CVV" placeholder="123" />
                    </div>
                    <Input label="Nome no cartão" placeholder="ANA B SOUZA" />
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="accent-primary" defaultChecked />
                      <span className="text-xs text-muted-foreground">Salvar cartão para próximas sessões</span>
                    </div>
                  </div>
                )}

                {payMethod === "pix" && (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-32 h-32 bg-muted rounded-2xl flex items-center justify-center border border-border">
                      <div className="grid grid-cols-4 gap-0.5">{Array(16).fill(0).map((_, i) => <div key={i} className={`w-3 h-3 rounded-sm ${Math.random() > 0.5 ? "bg-foreground" : "bg-white"}`} />)}</div>
                    </div>
                    <p className="text-sm text-muted-foreground">QR Code gerado após confirmar</p>
                    <Badge variant="success"><Clock size={11} />Expira em 15 min</Badge>
                  </div>
                )}

                {payMethod === "sub" && (
                  <div className="bg-muted rounded-xl p-4 text-sm text-muted-foreground">
                    <p>Cobrança mensal automática de <strong className="text-foreground">R$199/mês</strong>. Cancele quando quiser. Sem fidelidade.</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Btn variant="outline" onClick={() => setStep(1)}>Voltar</Btn>
                  <Btn variant="primary" className="flex-1 justify-center" onClick={handlePayment} disabled={processingPayment}>
                    <Lock size={15} />{processingPayment ? "Processando..." : "Pagar com segurança"}
                  </Btn>
                </div>
                {checkoutError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {checkoutError}
                  </div>
                )}
              </Card>
            )}

            {step === 3 && (
              <Card className="p-8 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle size={32} className="text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground font-display mb-2">Pagamento confirmado!</h2>
                <p className="text-muted-foreground text-sm mb-6">Sua sessão foi agendada com sucesso. Você receberá um e-mail de confirmação.</p>
                <div className="bg-muted rounded-xl p-4 w-full text-left mb-6">
                  <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">Profissional</span><span className="font-medium">{bookingDraft.professionalName}</span></div>
                  <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">Data e hora</span><span className="font-medium">{scheduledLabel}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Valor pago</span><span className="font-bold font-display">R${bookingDraft.price.toFixed(2).replace(".", ",")}</span></div>
                </div>
                <Btn variant="primary" className="w-full justify-center" onClick={() => onNavigate("patient-dashboard")}>
                  Ir para meu painel
                </Btn>
              </Card>
            )}
          </div>

          {/* Order summary */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <h2 className="font-semibold text-foreground font-display mb-4">Resumo</h2>
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                <PhotoOrInitials src={bookingDraft.professionalImg || undefined} name={bookingDraft.professionalName} className="w-12 h-12 rounded-2xl object-cover" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{bookingDraft.professionalName}</p>
                  <p className="text-xs text-muted-foreground">{bookingDraft.professionalRole}</p>
                  <p className="text-xs text-muted-foreground">{scheduledLabel} · Online</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Sessão individual</span><span>R${bookingDraft.price.toFixed(2).replace(".", ",")}</span></div>
                <div className="flex justify-between font-bold text-foreground border-t border-border pt-2 mt-2"><span>Total</span><span className="font-display">R${bookingDraft.price.toFixed(2).replace(".", ",")}</span></div>
              </div>
              <div className="mt-4 p-3 bg-primary/5 rounded-xl flex items-start gap-2">
                <Shield size={14} className="text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">Pagamento seguro. Os dados são criptografados e o profissional recebe após a sessão ser realizada.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: Financial Dashboard ──────────────────────────────────────────────

function FinancialDashboard({ onNavigate, currentUser, onSignOut }: AuthenticatedScreenProps) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("ehr") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", active: true, onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const revenueData = [
    { month: "Jul", bruto: 3800, liquido: 3420 }, { month: "Ago", bruto: 4200, liquido: 3780 },
    { month: "Set", bruto: 3900, liquido: 3510 }, { month: "Out", bruto: 4800, liquido: 4320 },
    { month: "Nov", bruto: 5200, liquido: 4680 }, { month: "Dez", bruto: 4600, liquido: 4140 },
    { month: "Jan", bruto: 5800, liquido: 5220 },
  ];

  const transfers = [
    { date: "07 Jan", amount: 1620, sessions: 9, status: "Processado" },
    { date: "31 Dez", amount: 1440, sessions: 8, status: "Processado" },
    { date: "24 Dez", amount: 900, sessions: 5, status: "Processado" },
    { date: "17 Dez", amount: 1980, sessions: 11, status: "Processado" },
    { date: "10 Dez", amount: 720, sessions: 4, status: "Processado" },
  ];

  return (
    <AppShell title="Dashboard Financeiro" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Receita bruta (Jan)" value="R$5.800" delta="+12%" icon={<TrendingUp size={18} />} color="green" />
          <StatCard label="Após comissão (10%)" value="R$5.220" delta="+12%" icon={<DollarSign size={18} />} color="blue" />
          <StatCard label="Pendente de repasse" value="R$1.440" icon={<Clock size={18} />} color="amber" />
          <StatCard label="Total acumulado 2025" value="R$5.220" icon={<BarChart2 size={18} />} color="purple" />
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground font-display">Receita bruta vs. líquida</h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-primary" />Bruto</span>
              <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-accent" />Líquido (após 10%)</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1B7A48" stopOpacity={0.15} /><stop offset="95%" stopColor="#1B7A48" stopOpacity={0} /></linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B6FA8" stopOpacity={0.15} /><stop offset="95%" stopColor="#3B6FA8" stopOpacity={0} /></linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF6F1" />
              <Tooltip formatter={(v: number, n: string) => [`R$${v.toLocaleString()}`, n === "bruto" ? "Bruto" : "Líquido"]} contentStyle={{ borderRadius: 12, border: "1px solid #E8F5EE", fontSize: 12 }} />
              <Area type="monotone" dataKey="bruto" stroke="#1B7A48" fill="url(#g1)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="liquido" stroke="#3B6FA8" fill="url(#g2)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="font-semibold text-foreground font-display mb-4">Histórico de repasses</h3>
            <div className="space-y-3">
              {transfers.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.date}</p>
                    <p className="text-xs text-muted-foreground">{t.sessions} sessões realizadas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground font-display">R${t.amount.toLocaleString()}</p>
                    <Badge variant="success">{t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-foreground font-display mb-4">Fiscal & Impostos</h3>
            <div className="space-y-3 mb-6">
              {[
                { label: "Receita bruta acumulada (2025)", value: "R$5.800,00" },
                { label: "ISS estimado (5%)", value: "R$290,00" },
                { label: "INSS estimado (11%)", value: "R$638,00" },
                { label: "IR estimado (tabela progressiva)", value: "R$312,00" },
                { label: "Comissão plataforma (10%)", value: "R$580,00" },
              ].map((r, i) => (
                <div key={i} className="flex justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium text-foreground">{r.value}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold pt-1">
                <span>Líquido estimado</span>
                <span className="text-primary font-display">R$3.980,00</span>
              </div>
            </div>
            <Btn variant="outline" size="sm" className="w-full justify-center"><Download size={14} />Exportar DRE (PDF)</Btn>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

// ─── SCREEN: Professional Settings (profile + availability) ──────────────────

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

type AvailabilitySlotRow = { id: string; weekday: number; start_time: string; end_time: string };

function ProfessionalSettingsScreen({ onNavigate, currentUser, onSignOut }: AuthenticatedScreenProps) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("ehr") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", active: true, onClick: () => onNavigate("professional-settings") },
  ];

  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [licenseType, setLicenseType] = useState("CRP");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [approaches, setApproaches] = useState("");
  const [sessionPrice, setSessionPrice] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [insurances, setInsurances] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [modalityOnline, setModalityOnline] = useState(false);
  const [modalityPresencial, setModalityPresencial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // One time range per weekday — simpler to fill than adding slots one at a time. Keyed by the
  // same weekday numbering as the DB (0=Sunday..6=Saturday).
  const [week, setWeek] = useState<Record<number, { enabled: boolean; start: string; end: string }>>(() =>
    Object.fromEntries(WEEKDAY_OPTIONS.map(w => [w.value, { enabled: false, start: "09:00", end: "18:00" }]))
  );
  const [savingWeek, setSavingWeek] = useState(false);
  const [weekMessage, setWeekMessage] = useState("");

  const loadAvailability = async () => {
    const { data } = await supabase
      .from("professional_availability")
      .select("id, weekday, start_time, end_time")
      .eq("professional_id", currentUser.id)
      .not("weekday", "is", null)
      .order("weekday", { ascending: true });

    const rows = (data ?? []) as AvailabilitySlotRow[];
    setWeek(prev => {
      const next = { ...prev };
      // Reset first so a day with its slot deleted elsewhere doesn't stay stuck "enabled".
      for (const w of WEEKDAY_OPTIONS) next[w.value] = { ...next[w.value], enabled: false };
      for (const row of rows) {
        next[row.weekday] = { enabled: true, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) };
      }
      return next;
    });
  };

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("professional_profiles")
        .select("license_type, license_number, bio, specialties, approaches, session_price, modalities, city, state, insurances, years_experience")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (!active) return;

      if (data) {
        setLicenseType(data.license_type ?? "CRP");
        setLicenseNumber(data.license_number ?? "");
        setBio(data.bio ?? "");
        setSpecialties((data.specialties ?? []).join(", "));
        setApproaches((data.approaches ?? []).join(", "));
        setSessionPrice(data.session_price ? String(data.session_price) : "");
        setCity(data.city ?? "");
        setRegion(data.state ?? "");
        setInsurances((data.insurances ?? []).join(", "));
        setYearsExperience(data.years_experience ? String(data.years_experience) : "");
        setModalityOnline((data.modalities ?? []).includes("online"));
        setModalityPresencial((data.modalities ?? []).includes("presencial"));
      } else {
        // This account's professional_profiles row was never created (e.g. it predates the
        // signup trigger that now creates it automatically). Without it, saving availability
        // fails with a foreign key violation — create a bare-minimum row now so everything below
        // works, then the professional can fill in the real details and save over it.
        await supabase.from("professional_profiles").insert({ id: currentUser.id, license_type: "CRP", license_number: "" });
      }

      const { data: profileRow } = await supabase.from("profiles").select("avatar_url").eq("id", currentUser.id).maybeSingle();
      if (active) setAvatarUrl(profileRow?.avatar_url ?? "");

      await loadAvailability();
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveMessage("");

    const modalities: string[] = [];
    if (modalityOnline) modalities.push("online");
    if (modalityPresencial) modalities.push("presencial");

    const { error } = await supabase
      .from("professional_profiles")
      .update({
        license_type: licenseType.trim() || "CRP",
        license_number: licenseNumber.trim(),
        bio: bio.trim() || null,
        specialties: specialties.split(",").map(s => s.trim()).filter(Boolean),
        approaches: approaches.split(",").map(s => s.trim()).filter(Boolean),
        session_price: Number(sessionPrice) || 0,
        modalities: modalities as any,
        city: city.trim() || null,
        state: region.trim() || null,
        insurances: insurances.split(",").map(s => s.trim()).filter(Boolean),
        years_experience: Number(yearsExperience) || 0,
      })
      .eq("id", currentUser.id);

    setSaving(false);

    if (error) {
      reportError(error, { flow: "professionalSettings.saveProfile" });
      setSaveMessage("Não foi possível salvar. Tente novamente.");
      return;
    }

    setSaveMessage("Perfil atualizado com sucesso.");
  };

  const handleUploadAvatar = async (file: File) => {
    setAvatarError("");
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(currentUser.id, file);
      setAvatarUrl(url);
    } catch (error) {
      reportError(error, { flow: "professionalSettings.uploadAvatar" });
      setAvatarError(error instanceof Error ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const toggleDay = (weekday: number, enabled: boolean) => {
    setWeek(prev => ({ ...prev, [weekday]: { ...prev[weekday], enabled } }));
  };
  const setDayTime = (weekday: number, field: "start" | "end", value: string) => {
    setWeek(prev => ({ ...prev, [weekday]: { ...prev[weekday], [field]: value } }));
  };

  /** Copies Monday's time range to every other day currently marked available — the fast path for
   *  the common "same hours every day I work" case. */
  const applyMondayToAll = () => {
    const monday = week[1];
    setWeek(prev => {
      const next = { ...prev };
      for (const w of WEEKDAY_OPTIONS) {
        if (next[w.value].enabled) next[w.value] = { ...next[w.value], start: monday.start, end: monday.end };
      }
      return next;
    });
  };

  const handleSaveWeek = async () => {
    setWeekMessage("");

    const invalidDay = WEEKDAY_OPTIONS.find(w => week[w.value].enabled && week[w.value].start >= week[w.value].end);
    if (invalidDay) {
      setWeekMessage(`${invalidDay.label}: o horário de início deve ser antes do horário de fim.`);
      return;
    }

    setSavingWeek(true);

    // Replace every recurring slot at once: simpler to reason about than diffing add/remove per
    // day, and matches the "one range per day" model this editor presents.
    const { error: deleteError } = await supabase
      .from("professional_availability")
      .delete()
      .eq("professional_id", currentUser.id)
      .not("weekday", "is", null);

    if (deleteError) {
      setSavingWeek(false);
      reportError(deleteError, { flow: "professionalSettings.saveWeek.delete" });
      setWeekMessage("Não foi possível salvar a agenda. Tente novamente.");
      return;
    }

    const rowsToInsert = WEEKDAY_OPTIONS
      .filter(w => week[w.value].enabled)
      .map(w => ({
        professional_id: currentUser.id,
        weekday: w.value,
        start_time: week[w.value].start,
        end_time: week[w.value].end,
      }));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("professional_availability").insert(rowsToInsert);
      if (insertError) {
        setSavingWeek(false);
        reportError(insertError, { flow: "professionalSettings.saveWeek.insert" });
        setWeekMessage("Não foi possível salvar a agenda. Tente novamente.");
        return;
      }
    }

    await loadAvailability();
    setSavingWeek(false);
    setWeekMessage("Agenda semanal salva com sucesso.");
  };

  if (loading) {
    return (
      <AppShell title="Configurações" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Configurações" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
      <div className="space-y-6 max-w-3xl">
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground font-display">Meu perfil profissional</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Esses dados aparecem no seu perfil público e são usados pelos filtros de busca do diretório (cidade/estado, especialidade, convênio, modalidade).
          </p>

          <div className="flex items-center gap-4">
            <PhotoOrInitials src={avatarUrl || undefined} name={currentUser.fullName} className="w-20 h-20 rounded-2xl object-cover bg-secondary text-xl" />
            <div>
              <label className="cursor-pointer">
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-border hover:bg-muted ${uploadingAvatar ? "opacity-50 pointer-events-none" : ""}`}>
                  <Upload size={14} />{uploadingAvatar ? "Enviando..." : avatarUrl ? "Trocar foto" : "Enviar foto"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  disabled={uploadingAvatar}
                  onChange={e => { const file = e.target.files?.[0]; if (file) void handleUploadAvatar(file); e.target.value = ""; }}
                />
              </label>
              <p className="text-xs text-muted-foreground mt-1.5">JPG ou PNG. Aparece no diretório e no seu perfil público.</p>
              {avatarError && <p className="text-xs text-red-600 mt-1">{avatarError}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Tipo de registro</label>
              <select value={licenseType} onChange={e => setLicenseType(e.target.value)} className="px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="CRP">CRP (Psicólogo)</option>
                <option value="CRM">CRM (Psiquiatra)</option>
              </select>
            </div>
            <Input label="Número do registro" placeholder="06/12345" value={licenseNumber} onChange={setLicenseNumber} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Sobre mim</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Conte um pouco sobre sua formação e forma de atendimento..."
              className="w-full h-28 p-3 bg-input-background border border-border rounded-xl text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Cidade" placeholder="São Paulo" value={city} onChange={setCity} />
            <Input label="Estado (UF)" placeholder="SP" value={region} onChange={setRegion} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Especialidades (separadas por vírgula)" placeholder="Ansiedade, Depressão, TCC" value={specialties} onChange={setSpecialties} />
            <Input label="Abordagens (separadas por vírgula)" placeholder="TCC, ACT" value={approaches} onChange={setApproaches} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor da sessão (R$)" placeholder="180" value={sessionPrice} onChange={setSessionPrice} />
            <Input label="Anos de experiência" placeholder="8" value={yearsExperience} onChange={setYearsExperience} />
          </div>

          <Input label="Convênios aceitos (separados por vírgula)" placeholder="Particular, Unimed" value={insurances} onChange={setInsurances} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Modalidade de atendimento</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={modalityOnline} onChange={e => setModalityOnline(e.target.checked)} className="accent-primary" />
                Online
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={modalityPresencial} onChange={e => setModalityPresencial(e.target.checked)} className="accent-primary" />
                Presencial
              </label>
            </div>
          </div>

          {saveMessage && (
            <p className={`text-xs ${saveMessage.includes("não") ? "text-red-600" : "text-emerald-600"}`}>{saveMessage}</p>
          )}
          <Btn variant="primary" onClick={handleSaveProfile} disabled={saving}>{saving ? "Salvando..." : "Salvar perfil"}</Btn>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground font-display">Disponibilidade semanal</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Marque os dias que você atende e o horário de cada um. Isso substitui a agenda inteira ao salvar.
              </p>
            </div>
            <Btn variant="ghost" size="sm" onClick={applyMondayToAll}>
              Repetir horário de segunda
            </Btn>
          </div>

          <div className="space-y-2">
            {WEEKDAY_OPTIONS.map(w => {
              const day = week[w.value];
              return (
                <div key={w.value} className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border ${day.enabled ? "bg-secondary/50 border-primary/20" : "bg-muted border-transparent"}`}>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer w-32">
                    <input type="checkbox" checked={day.enabled} onChange={e => toggleDay(w.value, e.target.checked)} className="accent-primary" />
                    {w.label}
                  </label>
                  {day.enabled ? (
                    <div className="flex items-center gap-2">
                      <input type="time" value={day.start} onChange={e => setDayTime(w.value, "start", e.target.value)} className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <span className="text-xs text-muted-foreground">até</span>
                      <input type="time" value={day.end} onChange={e => setDayTime(w.value, "end", e.target.value)} className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem atendimento</span>
                  )}
                </div>
              );
            })}
          </div>

          {weekMessage && (
            <p className={`text-xs ${weekMessage.includes("não") ? "text-red-600" : "text-emerald-600"}`}>{weekMessage}</p>
          )}
          <Btn variant="primary" onClick={handleSaveWeek} disabled={savingWeek}>{savingWeek ? "Salvando..." : "Salvar agenda da semana"}</Btn>
        </Card>
      </div>
    </AppShell>
  );
}

// ─── SCREEN: Admin Panel ──────────────────────────────────────────────────────

type PendingProfessional = {
  id: string;
  name: string;
  img: string;
  license: string;
  licenseType: string;
  licenseNumber: string;
  createdAt: string;
  documents: ProfessionalDocument[];
};

/** Official public registry lookup — there is no API for this, only these human-facing search
 *  pages (confirmed before building this: CFP/CFM don't expose a public verification API). The
 *  admin still has to search manually and compare against the uploaded document/license number;
 *  this just gets them to the right site with the number in hand instead of starting from scratch. */
function officialLicenseLookupUrl(licenseType: string): string {
  return licenseType === "CRM" ? "https://portal.cfm.org.br/busca-medicos/" : "https://cadastro.cfp.org.br/";
}

type AdminUserRow = {
  id: string;
  name: string;
  role: UserRole;
  phone: string | null;
  createdAt: string;
  suspendedAt: string | null;
};

type AdminPayment = {
  id: string;
  amount: number;
  platformFee: number;
  status: string;
  createdAt: string;
};

function AdminPanel({ onNavigate, currentUser, onSignOut }: AuthenticatedScreenProps) {
  const [adminTab, setAdminTab] = useState<"validations" | "users" | "payments">("validations");
  const navItems = [
    { icon: <Home size={18} />, label: "Visão geral", active: true, onClick: () => setAdminTab("validations") },
    { icon: <Shield size={18} />, label: "Validações", onClick: () => setAdminTab("validations") },
    { icon: <Users size={18} />, label: "Usuários", onClick: () => setAdminTab("users") },
    { icon: <CreditCard size={18} />, label: "Pagamentos", onClick: () => setAdminTab("payments") },
    { icon: <Settings size={18} />, label: "Configurações" },
  ];

  const [pending, setPending] = useState<PendingProfessional[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState<"all" | UserRole>("all");

  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  const [verifiedCount, setVerifiedCount] = useState(0);

  const loadPending = async () => {
    setLoadingPending(true);
    const { data } = await supabase
      .from("professional_profiles")
      .select("id, license_type, license_number, created_at, profiles(full_name, avatar_url)")
      .eq("verification_status", "pending")
      .order("created_at", { ascending: true });

    const rows = (data ?? []) as any[];
    const documentsByProfessional = await Promise.all(rows.map(p => listProfessionalDocuments(p.id).catch(() => [])));

    setPending(rows.map((p, i) => ({
      id: p.id,
      name: p.profiles?.full_name ?? "Profissional",
      img: p.profiles?.avatar_url ?? "",
      license: `${p.license_type} ${p.license_number}`,
      licenseType: p.license_type,
      licenseNumber: p.license_number,
      createdAt: p.created_at,
      documents: documentsByProfessional[i],
    })));
    setLoadingPending(false);
  };

  const handleViewDocument = async (storagePath: string) => {
    try {
      const url = await getDocumentSignedUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      reportError(error, { flow: "adminPanel.viewDocument" });
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    const { data } = await supabase.from("profiles").select("id, full_name, role, phone, created_at, suspended_at").order("created_at", { ascending: false });
    setUsers((data ?? []).map(u => ({ id: u.id, name: u.full_name, role: u.role, phone: u.phone, createdAt: u.created_at, suspendedAt: u.suspended_at })));
    setLoadingUsers(false);
  };

  const [userActionId, setUserActionId] = useState<string | null>(null);

  const handleUserAction = async (id: string, action: "suspend" | "unsuspend" | "delete") => {
    if (action === "suspend" && !window.confirm("Suspender esta conta? A pessoa não conseguirá mais entrar até ser reativada.")) return;
    if (action === "delete" && !window.confirm("Excluir esta conta permanentemente? Essa ação não pode ser desfeita.")) return;

    setUserActionId(id);
    const { data, error } = await supabase.functions.invoke("admin-manage-user", { body: { action, userId: id } });
    setUserActionId(null);

    if (error || (data as any)?.error) {
      reportError(error ?? new Error((data as any)?.error), { flow: "adminPanel.userAction" });
      window.alert((data as any)?.error ?? "Não foi possível completar a ação.");
      return;
    }

    if (action === "delete") {
      setUsers(prev => prev.filter(u => u.id !== id));
    } else {
      await loadUsers();
    }
  };

  useEffect(() => {
    void loadPending();

    (async () => {
      const { count } = await supabase
        .from("professional_profiles")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "verified");
      setVerifiedCount(count ?? 0);
    })();

    void loadUsers();

    (async () => {
      setLoadingPayments(true);
      const { data } = await supabase.from("payments").select("id, amount, platform_fee, status, created_at").order("created_at", { ascending: false });
      setPayments((data ?? []).map(p => ({ id: p.id, amount: Number(p.amount), platformFee: Number(p.platform_fee), status: p.status, createdAt: p.created_at })));
      setLoadingPayments(false);
    })();
  }, []);

  const handleVerification = async (id: string, status: "verified" | "rejected") => {
    setUpdatingId(id);
    const { error } = await supabase.from("professional_profiles").update({ verification_status: status }).eq("id", id);
    setUpdatingId(null);
    if (!error) {
      setPending(prev => prev.filter(p => p.id !== id));
      if (status === "verified") setVerifiedCount(prev => prev + 1);
    }
  };

  const patientCount = users.filter(u => u.role === "patient").length;
  const gmv = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const platformRevenue = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + p.platformFee, 0);

  const statsData = [
    { label: "Profissionais verificados", value: String(verifiedCount), icon: <Users size={18} />, color: "green" as const },
    { label: "Pacientes cadastrados", value: String(patientCount), icon: <Heart size={18} />, color: "blue" as const },
    { label: "Validações pendentes", value: String(pending.length), icon: <Clock size={18} />, color: "purple" as const },
    { label: "GMV total (pago)", value: `R$${gmv.toFixed(2).replace(".", ",")}`, icon: <DollarSign size={18} />, color: "amber" as const },
  ];

  const filteredUsers = users.filter(u => {
    const matchSearch = !userSearch.trim() || u.name.toLowerCase().includes(userSearch.trim().toLowerCase());
    const matchType = userTypeFilter === "all" || u.role === userTypeFilter;
    return matchSearch && matchType;
  });

  const roleLabel = (role: UserRole) => role === "professional" ? "Profissional" : role === "admin" ? "Admin" : "Paciente";

  return (
    <AppShell title="Painel Administrativo" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statsData.map(s => (
            <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} color={s.color} />
          ))}
        </div>

        <div className="flex gap-2 border-b border-border">
          {[{ id: "validations" as const, label: "Validações pendentes" }, { id: "users" as const, label: "Usuários" }, { id: "payments" as const, label: "Pagamentos" }].map(t => (
            <button key={t.id} onClick={() => setAdminTab(t.id)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-all ${adminTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
              {t.id === "validations" && pending.length > 0 && <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">{pending.length}</span>}
            </button>
          ))}
        </div>

        {adminTab === "validations" && (
          <div className="space-y-4">
            {loadingPending && <p className="text-sm text-muted-foreground">Carregando validações...</p>}
            {!loadingPending && pending.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma validação pendente no momento.</Card>}
            {pending.map(p => (
              <Card key={p.id} className="p-5">
                <div className="flex items-center gap-4">
                  <Avatar name={p.name} src={p.img || undefined} size="md" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground text-sm">{p.name}</h3>
                      <Badge variant="outline">{p.license}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Enviado em {new Date(p.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="danger" size="sm" disabled={updatingId === p.id} onClick={() => handleVerification(p.id, "rejected")}><X size={14} />Rejeitar</Btn>
                    <Btn variant="primary" size="sm" disabled={updatingId === p.id} onClick={() => handleVerification(p.id, "verified")}><Check size={14} />Aprovar</Btn>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">Documentos:</span>
                  {p.documents.length === 0 && <span className="text-xs text-muted-foreground">nenhum enviado ainda</span>}
                  {p.documents.map(doc => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleViewDocument(doc.storagePath)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-secondary transition-all"
                    >
                      <Eye size={11} />{doc.fileName}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">Confirmar registro:</span>
                  <a
                    href={officialLicenseLookupUrl(p.licenseType)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary hover:bg-secondary transition-all"
                  >
                    <Shield size={11} />
                    Consultar {p.licenseType} {p.licenseNumber} no {p.licenseType === "CRM" ? "CFM" : "CFP"} (site oficial)
                  </a>
                </div>
              </Card>
            ))}
          </div>
        )}

        {adminTab === "users" && (
          <Card className="overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-border">
              <Input placeholder="Buscar usuário..." icon={<Search size={15} />} className="w-64" value={userSearch} onChange={setUserSearch} />
              <div className="flex gap-2">
                <select
                  value={userTypeFilter}
                  onChange={e => setUserTypeFilter(e.target.value as "all" | UserRole)}
                  className="px-3 py-2 bg-muted border border-border rounded-xl text-xs text-foreground focus:outline-none"
                >
                  <option value="all">Todos os tipos</option>
                  <option value="patient">Pacientes</option>
                  <option value="professional">Profissionais</option>
                  <option value="admin">Admins</option>
                </select>
                <Btn
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("usuarios-mindcare.csv", [
                    ["Nome", "Tipo", "Telefone", "Cadastro"],
                    ...filteredUsers.map(u => [u.name, roleLabel(u.role), u.phone ?? "", new Date(u.createdAt).toLocaleDateString("pt-BR")]),
                  ])}
                >
                  <Download size={14} />Exportar
                </Btn>
              </div>
            </div>
            {loadingUsers && <p className="text-sm text-muted-foreground p-4">Carregando usuários...</p>}
            {!loadingUsers && (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50"><tr>{["Usuário", "Tipo", "Telefone", "Cadastro", "Status", "Ações"].map(h => <th key={h} className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4"><p className="font-medium text-foreground">{u.name}</p></td>
                      <td className="py-3 px-4"><Badge variant={u.role === "professional" ? "accent" : u.role === "admin" ? "warning" : "outline"}>{roleLabel(u.role)}</Badge></td>
                      <td className="py-3 px-4 text-muted-foreground">{u.phone ?? "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">{new Date(u.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td className="py-3 px-4">
                        {u.suspendedAt
                          ? <Badge variant="danger">Suspenso</Badge>
                          : <Badge variant="success">Ativo</Badge>}
                      </td>
                      <td className="py-3 px-4">
                        {u.role === "admin" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex gap-2">
                            {u.suspendedAt ? (
                              <Btn variant="outline" size="sm" disabled={userActionId === u.id} onClick={() => handleUserAction(u.id, "unsuspend")}>Reativar</Btn>
                            ) : (
                              <Btn variant="outline" size="sm" disabled={userActionId === u.id} onClick={() => handleUserAction(u.id, "suspend")}>Suspender</Btn>
                            )}
                            <Btn variant="danger" size="sm" disabled={userActionId === u.id} onClick={() => handleUserAction(u.id, "delete")}>Excluir</Btn>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Card>
        )}

        {adminTab === "payments" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-semibold text-foreground font-display mb-4">Pagamentos recentes</h3>
              {loadingPayments && <p className="text-sm text-muted-foreground">Carregando pagamentos...</p>}
              {!loadingPayments && payments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>}
              <div className="divide-y divide-border">
                {payments.slice(0, 10).map(p => (
                  <div key={p.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-foreground">R${p.amount.toFixed(2).replace(".", ",")}</p>
                      <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <Badge variant={p.status === "paid" ? "success" : p.status === "refunded" ? "danger" : "outline"}>
                      {p.status === "paid" ? "Pago" : p.status === "refunded" ? "Reembolsado" : "Pendente"}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold text-foreground font-display mb-4">Métricas de comissão</h3>
              <div className="space-y-3">
                {[
                  ["GMV total (pago)", `R$${gmv.toFixed(2).replace(".", ",")}`],
                  ["Comissão da plataforma", `R$${platformRevenue.toFixed(2).replace(".", ",")}`],
                  ["Repasses a profissionais", `R$${(gmv - platformRevenue).toFixed(2).replace(".", ",")}`],
                  ["Transações pagas", String(payments.filter(p => p.status === "paid").length)],
                  ["Transações pendentes", String(payments.filter(p => p.status === "pending").length)],
                  ["Reembolsos", String(payments.filter(p => p.status === "refunded").length)],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                    <span className="text-muted-foreground">{l}</span><span className="font-medium text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => pathToScreen(window.location.pathname)?.screen ?? "landing");
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedProfessionalId, setSelectedProfessionalIdState] = useState<string | null>(() => pathToScreen(window.location.pathname)?.professionalId ?? null);
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null);
  const [activeAppointmentId, setActiveAppointmentIdState] = useState<string | null>(() => pathToScreen(window.location.pathname)?.appointmentId ?? null);
  const [paymentReturnStatus, setPaymentReturnStatus] = useState<"success" | "pending" | "failure" | null>(null);
  // Separate from activeAppointmentId (used by the video screen) so jumping to EHR from Calendar
  // never overwrites an in-progress video call's id if the user switches between the two screens.
  const [ehrPatientId, setEhrPatientId] = useState<string | null>(null);
  const [ehrAppointmentId, setEhrAppointmentId] = useState<string | null>(null);
  const onOpenEhr = (patientId: string, appointmentId: string) => {
    setEhrPatientId(patientId);
    setEhrAppointmentId(appointmentId);
  };

  // Refs mirror the two id states synchronously so `navigate()` can read the value a sibling
  // setter just set in the same click handler (e.g. DirectoryPage calls onSelectProfessional(id)
  // then onNavigate("profile") — React state wouldn't reflect the new id until the next render).
  const selectedProfessionalIdRef = useRef(selectedProfessionalId);
  const activeAppointmentIdRef = useRef(activeAppointmentId);

  const setSelectedProfessionalId = (id: string | null) => {
    selectedProfessionalIdRef.current = id;
    setSelectedProfessionalIdState(id);
  };
  const setActiveAppointmentId = (id: string | null) => {
    activeAppointmentIdRef.current = id;
    setActiveAppointmentIdState(id);
  };

  const navigate = (next: Screen) => {
    setScreen(next);
    const path = screenToPath(next, {
      professionalId: selectedProfessionalIdRef.current,
      appointmentId: activeAppointmentIdRef.current,
    });
    if (path !== window.location.pathname) {
      window.history.pushState({}, "", path);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const parsed = pathToScreen(window.location.pathname);
      setScreen(parsed?.screen ?? "landing");
      if (parsed?.professionalId) setSelectedProfessionalId(parsed.professionalId);
      if (parsed?.appointmentId) setActiveAppointmentId(parsed.appointmentId);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const mpStatus = new URLSearchParams(window.location.search).get("mp");
    if (mpStatus === "success" || mpStatus === "pending" || mpStatus === "failure") {
      setPaymentReturnStatus(mpStatus);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const noTopNavScreens: Screen[] = ["video", "patient-dashboard", "pro-dashboard", "calendar", "ehr", "ai-assistant", "financial", "admin", "professional-settings"];
  const protectedScreens: Screen[] = ["patient-dashboard", "pro-dashboard", "calendar", "ehr", "ai-assistant", "video", "checkout", "financial", "admin", "professional-settings"];
  // Screens restricted to specific roles; screens absent from this map are open to any authenticated user (e.g. video, shared by patient + professional).
  const screenRoles: Partial<Record<Screen, UserRole[]>> = {
    "patient-dashboard": ["patient"],
    "pro-dashboard": ["professional"],
    calendar: ["professional"],
    ehr: ["professional"],
    "ai-assistant": ["professional"],
    financial: ["professional"],
    "professional-settings": ["professional"],
    admin: ["admin"],
    checkout: ["patient"],
  };
  const homeScreenForRole = (role: UserRole): Screen =>
    role === "professional" ? "pro-dashboard" : role === "admin" ? "admin" : "patient-dashboard";
  const showTopNav = !noTopNavScreens.includes(screen);

  const loadAppUser = async (nextSession: Session | null) => {
    setSession(nextSession);

    if (!nextSession?.user) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    const metadata = nextSession.user.user_metadata as { full_name?: string; role?: UserRole };
    let nextUser: AppUser = {
      id: nextSession.user.id,
      email: nextSession.user.email ?? "",
      fullName: metadata.full_name ?? nextSession.user.email ?? "Usuário",
      role: metadata.role ?? "patient",
    };

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, terms_accepted_at")
      .eq("id", nextSession.user.id)
      .maybeSingle();

    if (data) {
      nextUser = {
        ...nextUser,
        fullName: data.full_name,
        role: data.role,
      };

      // The signup checkbox already blocks both the e-mail and Google sign-up buttons until
      // checked (see LoginPage's acceptedTerms gate) — so the first time this authenticated
      // session appears with a null terms_accepted_at, that's faithful evidence of real consent,
      // recorded here instead of relying on the column's old (now removed) `default now()`, which
      // only proved "a row was created," not "someone actually agreed to anything."
      if (!data.terms_accepted_at) {
        void supabase
          .from("profiles")
          .update({ terms_accepted_at: new Date().toISOString(), terms_version: CURRENT_TERMS_VERSION })
          .eq("id", nextSession.user.id);
      }
    }

    setCurrentUser(nextUser);
    setAuthLoading(false);
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) void loadAppUser(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("reset-password");
      }
      void loadAppUser(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (protectedScreens.includes(screen) && !currentUser) {
      navigate("login");
      return;
    }

    if (currentUser) {
      const allowedRoles = screenRoles[screen];
      if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
        navigate(homeScreenForRole(currentUser.role));
      }
    }
  }, [authLoading, currentUser, screen]);

  // handleAuth() can't navigate straight to the dashboard on login success: currentUser is
  // still loading (async profiles fetch via onAuthStateChange), so the protectedScreens guard
  // above would immediately bounce back to /entrar. Wait for currentUser instead.
  useEffect(() => {
    if (!authLoading && currentUser && screen === "login") {
      navigate(homeScreenForRole(currentUser.role));
    }
  }, [authLoading, currentUser, screen]);

  // Mercado Pago's back_urls land the browser back on "/" with no session context of what
  // happened; once the user's session has loaded, send them to their dashboard to see the result.
  useEffect(() => {
    if (!authLoading && currentUser && paymentReturnStatus) {
      navigate(homeScreenForRole(currentUser.role));
    }
  }, [authLoading, currentUser, paymentReturnStatus]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setCurrentUser(null);
    navigate("landing");
  };

  // A banned account (admin-manage-user's suspend action) can no longer log in or refresh its
  // token, but an access token issued before the ban stays valid — and accepted everywhere — until
  // it naturally expires (jwt_expiry = 3600s). This closes most of that window by re-checking the
  // account's own suspended_at (allowed by profiles_select's `auth.uid() = id`) periodically and on
  // tab focus, signing the user out the moment it's set instead of waiting up to an hour.
  const [suspendedNotice, setSuspendedNotice] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    let active = true;

    const checkSuspended = async () => {
      const { data } = await supabase.from("profiles").select("suspended_at").eq("id", currentUser.id).maybeSingle();
      if (active && data?.suspended_at) {
        setSuspendedNotice("Sua conta foi suspensa. Entre em contato com o suporte.");
        await handleSignOut();
      }
    };

    const interval = setInterval(() => void checkSuspended(), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void checkSuspended(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentUser?.id]);

  return (
    <div className="min-h-screen bg-background font-sans" style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      {showTopNav && <TopNav onScreenChange={navigate} current={screen} currentUser={currentUser} onSignOut={handleSignOut} />}
      {authLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 text-sm text-muted-foreground">
          Carregando sessão...
        </div>
      )}
      {paymentReturnStatus && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] rounded-xl border px-4 py-3 text-sm shadow-lg flex items-start justify-between gap-3 ${
            paymentReturnStatus === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : paymentReturnStatus === "pending"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <span>
            {paymentReturnStatus === "success" && "Pagamento aprovado! Sua consulta está confirmada."}
            {paymentReturnStatus === "pending" && "Pagamento em processamento. A confirmação chega em instantes."}
            {paymentReturnStatus === "failure" && "Não foi possível concluir o pagamento. Tente novamente."}
          </span>
          <button type="button" onClick={() => setPaymentReturnStatus(null)} className="flex-shrink-0"><X size={16} /></button>
        </div>
      )}
      {screen === "landing" && <LandingPage onNavigate={navigate} />}
      {screen === "directory" && <DirectoryPage onNavigate={navigate} onSelectProfessional={setSelectedProfessionalId} />}
      {screen === "profile" && <ProfilePage onNavigate={navigate} professionalId={selectedProfessionalId} onBook={setBookingDraft} />}
      {screen === "login" && <LoginPage onNavigate={navigate} initialInfo={suspendedNotice} />}
      {screen === "reset-password" && <ResetPasswordScreen onNavigate={navigate} />}
      {screen === "patient-dashboard" && currentUser && <PatientDashboard onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} onEnterVideo={setActiveAppointmentId} />}
      {screen === "pro-dashboard" && currentUser && <ProfessionalDashboard onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} onEnterVideo={setActiveAppointmentId} />}
      {screen === "calendar" && currentUser && <CalendarScreen onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} onEnterVideo={setActiveAppointmentId} onOpenEhr={onOpenEhr} />}
      {screen === "ehr" && currentUser && <EHRScreen onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} initialPatientId={ehrPatientId} initialAppointmentId={ehrAppointmentId} />}
      {screen === "ai-assistant" && currentUser && <AIAssistantScreen onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} />}
      {screen === "video" && currentUser && <VideoScreen onNavigate={navigate} currentUser={currentUser} appointmentId={activeAppointmentId} />}
      {screen === "pricing" && <PricingPage onNavigate={navigate} />}
      {screen === "checkout" && currentUser && <CheckoutScreen onNavigate={navigate} currentUser={currentUser} bookingDraft={bookingDraft} />}
      {screen === "financial" && currentUser && <FinancialDashboard onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} />}
      {screen === "professional-settings" && currentUser && <ProfessionalSettingsScreen onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} />}
      {screen === "admin" && currentUser && <AdminPanel onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} />}
    </div>
  );
}

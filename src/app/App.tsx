import { useEffect, useState, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { invokeEdgeFunction, onSessionExpired } from "../lib/functionsClient";
import { mockPaymentProvider, createAsaasCheckout } from "../lib/payment-provider";
import type { UserRole, PaymentStatus } from "../lib/database.types";
import { getUpcomingAvailableDays, generateSlotsForDay, type TimeBlock } from "../lib/scheduling";
import { downloadCsv, parseCsv } from "../lib/csv";
import { getLastMonths, bucketAmountsByMonth } from "../lib/revenue";
import { calculateAttendanceRate, calculateCancellationRate, calculateNoShowRate, calculateRetentionRate } from "../lib/metrics";
import { joinWaitlist, leaveWaitlist, listMyWaitlistEntries, notifyWaitlistMatch, type WaitlistEntry } from "../lib/waitlist";
import { reportError } from "../lib/monitoring";
import { termsOfService, privacyPolicy, CURRENT_TERMS_VERSION, type LegalDocument } from "../content/legal";
import { informedConsent, CURRENT_CONSENT_VERSION } from "../content/consent";
import { hashDocumentText, signConsent } from "../lib/consent";
import { signSessionNote } from "../lib/sessionSignature";
import { uploadProfessionalDocument, listProfessionalDocuments, getDocumentSignedUrl, type ProfessionalDocument } from "../lib/documents";
import { uploadAvatar } from "../lib/avatar";
import { uploadLogo } from "../lib/logo";
import { uploadCoverImage } from "../lib/coverImage";
import {
  listTagsForProfessional, createPatientTag, deletePatientTag,
  PATIENT_TAG_COLORS, PATIENT_TAG_COLOR_CLASSES,
  type PatientTag, type PatientTagColor,
} from "../lib/patientTags";
import { getLiveKitRoomAccess, type LiveKitRoomAccess } from "../lib/video";
import { getAISessionSummary, improveTextWithAI, transcribeHandwriting, planSessionWithAI, type AISessionSummary, type SessionPlan } from "../lib/ai";
import { plainTextToTiptapJson, tiptapJsonToPlainText } from "../lib/richText";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import { scoreFromTemplate, type AnswerOption, type SeverityBand } from "../lib/assessments";
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, type AssessmentTemplate } from "../lib/assessmentTemplates";
import {
  listLocations, createLocation, deleteLocation, listServices, createService, deleteService,
  type ProfessionalLocation, type ProfessionalService,
} from "../lib/professionalLocations";
import {
  inviteStaffMember, listMyStaff, removeStaffMember, listMyProfessionals,
  inviteClinicProfessional, listClinicProfessionals,
  type StaffMember, type ClinicProfessional,
} from "../lib/clinics";
import {
  listPlans, getMySubscription, createSubscription, getSubscriptionAccess,
  type SubscriptionPlan, type ProfessionalSubscription,
} from "../lib/subscriptions";
import {
  listCoupons, createCoupon, setCouponActive, deleteCoupon, validateCoupon,
  type Coupon, type CouponPreview,
} from "../lib/coupons";
import {
  uploadPatientMaterial, listMaterialsForProfessional, deletePatientMaterial, getMaterialSignedUrl,
  listMaterialsForPatient, assignTask, listTasksForPatient, listTasksForProfessional, markTaskCompleted,
  type PatientMaterial, type PatientTask,
} from "../lib/materials";
import { getPatientProfile, upsertPatientProfile, type PatientProfile } from "../lib/patients";
import {
  uploadPatientDocument, listPatientDocuments, deletePatientDocument, getPatientDocumentSignedUrl,
  type PatientDocument,
} from "../lib/patientDocuments";
import {
  listAppointmentsWithPaymentStatus, createPixCharge, requestNotaFiscal, getPayment, markAppointmentPaid,
  type AppointmentWithPaymentStatus,
} from "../lib/payments";
import { generateReceiptPdf, missingReceitaSaudeFields } from "../lib/receipt";
import {
  listEffectiveTemplates, saveTemplateCustomization, fillTemplate, buildAutoFillData,
  DOCUMENT_TEMPLATE_TYPES, DOCUMENT_TEMPLATE_LABELS, TEMPLATE_PLACEHOLDERS,
  type DocumentTemplateType, type EffectiveTemplate,
} from "../lib/documentTemplates";
import {
  generateAndSignDocument, listGeneratedDocuments, getGeneratedDocumentSignedUrl,
  markGeneratedDocumentSent, printGeneratedDocument,
  type GeneratedDocument,
} from "../lib/generatedDocuments";
import { createPatientAccount } from "../lib/professionalPatients";
import { confirmAttendance } from "../lib/confirmation";
import {
  listThreadMessages, listAllMessagesFor, sendMessage, markThreadRead, subscribeToMessages, groupIntoConversations,
  listUnreadMessageNotifications, subscribeToMyMessages,
  type ChatMessage, type Conversation, type UnreadMessageNotification,
} from "../lib/messages";
import { formatAiSummaryText } from "../lib/aiSummary";
import { type Screen, screenToPath, pathToScreen } from "../lib/routing";
import { getWeekStart, getWeekDays, isSameDay, formatWeekRangeLabel } from "../lib/calendar";
import { canEnterSession } from "../lib/sessionAccess";
import type { VerificationStatus } from "../lib/database.types";
import {
  Brain, Search, Star, Shield, Video, Calendar, FileText, CreditCard,
  BarChart2, Users, Settings, Bell, ChevronDown, ChevronRight, ChevronLeft,
  Check, X, Menu, Mic, MicOff, Phone, PhoneOff, Monitor, MessageSquare,
  Upload, Download, Plus, Filter, MapPin, Globe, Clock, DollarSign,
  Heart, Award, BookOpen, Zap, Lock, TrendingUp, ArrowUpRight, ArrowDownRight,
  AlertCircle, CheckCircle, User, LogOut, Home, Activity, Clipboard,
  Camera, Send, Paperclip, MoreHorizontal, Edit3, Trash2, RefreshCw,
  ChevronUp, Eye, EyeOff, Info, HelpCircle, Mail, Phone as PhoneIcon,
  Copy, Link2, QrCode, Receipt, Printer, List, Image as ImageIcon, Bold, Italic, Sparkles, ScanText, MapPinned,
  Tag, Percent,
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

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

function useCurrentTime(refreshIntervalMs = 15_000): number {
  const [currentTime, setCurrentTime] = useState(Date.now);

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), refreshIntervalMs);
    return () => window.clearInterval(intervalId);
  }, [refreshIntervalMs]);

  return currentTime;
}

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
  slug?: string | null;
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
  targetAudience: string[];
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

function Btn({ children, variant = "primary", size = "md", className = "", onClick, disabled, style }: {
  children: React.ReactNode; variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; className?: string; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties;
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
      style={style}
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

/** Read-only rendering of an Input's value — used where the professional can view a patient's own
 *  data (ficha cadastral) but only the patient can edit it. */
function ReadOnlyField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value.trim() || "—"}</span>
    </div>
  );
}

const EMPTY_TIPTAP_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/** Minimal Tiptap wrapper used for the 4 SOAP fields (Prontuário rico) — bold/italic/lists plus
 *  optional inline images. `onImageUpload` is injected by the caller (needs a patient id to scope
 *  the upload to) and should resolve to a URL the browser can load directly. */
function RichTextEditor({ content, onChange, disabled, onImageUpload }: {
  content: JSONContent;
  onChange: (doc: JSONContent) => void;
  disabled?: boolean;
  onImageUpload?: () => Promise<string | null>;
}) {
  const editor = useEditor({
    extensions: [StarterKit, TiptapImage],
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Re-syncs the editor when the caller swaps in different content (switching sessions) — but not
  // on every keystroke, since onUpdate above already reflects those back into `content` and
  // re-applying our own output would reset the cursor position.
  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className={`border border-border rounded-xl overflow-hidden ${disabled ? "bg-muted/30" : "bg-white"}`}>
      {!disabled && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/50 border-b border-border">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1.5 rounded ${editor.isActive("bold") ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted"}`}><Bold size={14} /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1.5 rounded ${editor.isActive("italic") ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted"}`}><Italic size={14} /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded ${editor.isActive("bulletList") ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted"}`}><List size={14} /></button>
          {onImageUpload && (
            <button
              type="button"
              onClick={async () => {
                const url = await onImageUpload();
                if (url) editor.chain().focus().setImage({ src: url }).run();
              }}
              className="p-1.5 rounded text-muted-foreground hover:bg-muted"
            >
              <ImageIcon size={14} />
            </button>
          )}
        </div>
      )}
      <EditorContent editor={editor} className="px-3 py-2 text-sm text-foreground min-h-[80px] max-h-64 overflow-y-auto [&_.ProseMirror]:outline-none [&_img]:max-w-full [&_img]:rounded-lg [&_ul]:list-disc [&_ul]:pl-5" />
    </div>
  );
}

/** Loading placeholder — a plain animated bar. Compose these into shapes (SkeletonProfessionalCard
 *  below) instead of showing "Carregando..." text where the real layout is known ahead of time. */
/** Shown at the top of Agenda/Pacientes/Prontuário/Financeiro/IA/Biblioteca while the professional
 *  (or their clinic) hasn't got an active subscription yet — those screens stay fully browsable,
 *  this is just the explanation for why their action buttons are disabled. Configurações/Meu plano
 *  is the one screen that's never gated, so the CTA always points there. */
function SubscriptionLockedBanner({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-amber-800">
        <span className="font-medium">Assinatura pendente.</span> Você pode conhecer esta área, mas ações como criar, salvar ou enviar ficam liberadas depois do pagamento.
      </p>
      <Btn variant="primary" size="sm" onClick={() => onNavigate("professional-settings")}>Ir para Meu plano</Btn>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} />;
}

function SkeletonProfessionalCard() {
  return (
    <Card className="p-5">
      <div className="flex gap-4 mb-4">
        <Skeleton className="w-16 h-16 rounded-2xl flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex gap-1.5 mb-4">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full mb-4" />
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-8 w-20 rounded-xl" />
      </div>
    </Card>
  );
}

function SkeletonAppointmentRow() {
  return (
    <Card className="p-4 flex items-center gap-4">
      <Skeleton className="w-12 h-12 rounded-2xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-8 w-20 rounded-xl flex-shrink-0" />
    </Card>
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
  currentUser,
  onNotificationClick,
}: {
  children: React.ReactNode;
  title: string;
  navItems: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }[];
  userName: string;
  onSignOut: () => void;
  currentUser: AppUser;
  onNotificationClick?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<UnreadMessageNotification[]>([]);

  const loadNotifications = async () => {
    const data = await listUnreadMessageNotifications(currentUser.id).catch(() => []);
    setNotifications(data);
  };

  useEffect(() => {
    void loadNotifications();
    return subscribeToMyMessages(currentUser.id, () => void loadNotifications());
  }, [currentUser.id]);

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
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 relative">
          <h1 className="font-semibold text-foreground font-display">{title}</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button className="relative p-2 rounded-xl hover:bg-muted" onClick={() => setNotifOpen(o => !o)}>
                <Bell size={18} className="text-muted-foreground" />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[10px] leading-4 text-white text-center font-semibold">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-11 w-80 bg-white border border-border rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-semibold text-foreground">Notificações</p>
                    </div>
                    {notifications.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma mensagem nova.</p>}
                    {notifications.map(n => (
                      <button
                        key={n.id}
                        onClick={() => { setNotifOpen(false); onNotificationClick?.(); }}
                        className="w-full text-left px-4 py-3 flex items-start gap-3 border-b border-border/50 hover:bg-muted last:border-0"
                      >
                        <PhotoOrInitials src={n.senderAvatar || undefined} name={n.senderName} className="w-8 h-8 rounded-full object-cover bg-secondary flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{n.senderName}</p>
                          <p className="text-xs text-muted-foreground truncate">{n.content}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
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

  const [verifiedCount, setVerifiedCount] = useState<number | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [positivePct, setPositivePct] = useState<number | null>(null);
  const [testimonials, setTestimonials] = useState<{ id: string; text: string; rating: number; professionalName: string }[]>([]);

  // Real counts, not invented marketing numbers — grows on its own as professionals are verified
  // and patients leave reviews, instead of a hardcoded "+2.400 profissionais verificados" that
  // never actually reflected the platform's real numbers.
  useEffect(() => {
    let active = true;
    (async () => {
      const [{ count }, { data: reviewRows }, { data: testimonialRows }] = await Promise.all([
        supabase.from("professional_profiles").select("id", { count: "exact", head: true }).eq("verification_status", "verified"),
        supabase.from("reviews").select("rating"),
        // Real written reviews only — never the reviewer's name (reviews_select_all is public/
        // anonymous, and profiles RLS rightly doesn't expose a patient's identity to anonymous
        // visitors), just which verified professional the praise is about.
        supabase
          .from("reviews")
          .select("id, rating, comment, professional_profiles(profiles(full_name))")
          .not("comment", "is", null)
          .gte("rating", 4)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      if (!active) return;
      setVerifiedCount(count ?? 0);
      const ratings = (reviewRows ?? []).map(r => r.rating as number);
      setAvgRating(ratings.length ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null);
      setPositivePct(ratings.length ? (ratings.filter(r => r >= 4).length / ratings.length) * 100 : null);
      setTestimonials(((testimonialRows ?? []) as any[]).map(r => ({
        id: r.id,
        text: r.comment as string,
        rating: r.rating as number,
        professionalName: r.professional_profiles?.profiles?.full_name ?? "um profissional da plataforma",
      })));
    })();
    return () => {
      active = false;
    };
  }, []);

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

  const faqs = [
    { q: "Como os profissionais são verificados?", a: "Nossa equipe valida CRP/CRM junto ao conselho federal e estadual. O processo leva até 48h após o envio da documentação." },
    { q: "Posso cancelar a qualquer momento?", a: "Sim. Sem multa nem fidelidade. O acesso continua até o fim do período pago." },
    { q: "Os dados dos pacientes são seguros?", a: "Totalmente. Usamos criptografia AES-256 e seguimos rigorosamente a LGPD. Seus dados nunca são vendidos." },
    { q: "Existe app móvel?", a: "Ainda não temos um app nativo para iOS ou Android — está no nosso roadmap. A plataforma web já é totalmente responsiva e funciona bem no navegador do celular, incluindo videochamada e prontuário." },
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
              <Badge variant="success" className="mb-6"><CheckCircle size={12} />{verifiedCount === null ? "Profissionais verificados" : `${verifiedCount} profissionais verificados`}</Badge>
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
                {[
                  [avgRating !== null ? avgRating.toFixed(1) : "—", "★ avaliação média"],
                  [positivePct !== null ? `${Math.round(positivePct)}%` : "—", "satisfação"],
                  ["24h", "suporte"],
                ].map(([v, l]) => (
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

      {/* Testimonials — real reviews only (reviews.comment), never fabricated. Section is simply
          absent until there's at least one real written review to show; the reviewer's name is
          intentionally never shown here (see the fetch above) even though it would be for a
          logged-in professional/patient elsewhere in the app. */}
      {testimonials.length > 0 && (
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground font-display mb-3">O que dizem sobre nós</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map(t => (
                <Card key={t.id} className="p-6">
                  <div className="flex mb-3">{Array(t.rating).fill(0).map((_, j) => <Star key={j} size={14} className="text-amber-400 fill-amber-400" />)}</div>
                  <p className="text-sm text-foreground leading-relaxed mb-4 italic">"{t.text}"</p>
                  <p className="text-xs text-muted-foreground">Avaliação de paciente sobre {t.professionalName}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

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
  const [audience, setAudience] = useState("all");
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
        .select("id, slug, bio, license_type, license_number, specialties, approaches, session_price, modalities, city, state, insurances, years_experience, target_audience, profiles!inner(full_name, avatar_url)")
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
            slug: item.slug ?? null,
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
            targetAudience: item.target_audience ?? [],
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
    const matchAudience = audience === "all" || p.targetAudience.some(item => item.toLowerCase() === audience.toLowerCase());
    return matchSearch && matchCity && matchModality && matchSpecialty && matchInsurance && matchAudience;
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
            <select
              value={audience}
              onChange={e => setAudience(e.target.value)}
              className="px-4 py-2.5 bg-input-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Qualquer público-alvo</option>
              {TARGET_AUDIENCE_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
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
        {!loadingProfessionals && (
          <p className="text-sm text-muted-foreground mb-6">{filtered.length} profissionais encontrados</p>
        )}
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
          {loadingProfessionals && Array.from({ length: 6 }).map((_, i) => <SkeletonProfessionalCard key={`skeleton-${i}`} />)}
          {!loadingProfessionals && filtered.map((p, i) => (
            <Card key={p.id ?? i} className="p-5 hover:border-primary/30 transition-all cursor-pointer" onClick={() => { if (p.id) { onSelectProfessional(p.slug || p.id); onNavigate("profile"); } }}>
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
  coverUrl: string | null;
  accentColor: string | null;
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ProfilePage({ onNavigate, professionalId, onBook, currentUser }: {
  onNavigate: (s: Screen) => void;
  professionalId: string | null;
  onBook: (draft: BookingDraft) => void;
  currentUser: AppUser | null;
}) {
  const [tab, setTab] = useState("sobre");
  const [pro, setPro] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [availability, setAvailability] = useState<{ weekday: number | null; start_time: string; end_time: string }[]>([]);
  const [bookedTimes, setBookedTimes] = useState<Set<string>>(new Set());
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [locations, setLocations] = useState<ProfessionalLocation[]>([]);
  const [services, setServices] = useState<ProfessionalService[]>([]);
  const [reviews, setReviews] = useState<{ name: string; rating: number; comment: string | null }[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedTakenSlot, setSelectedTakenSlot] = useState<string | null>(null);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistMessage, setWaitlistMessage] = useState("");

  const handleJoinWaitlist = async () => {
    if (!selectedTakenSlot || !professionalId) return;
    if (!currentUser) {
      onNavigate("login");
      return;
    }
    setJoiningWaitlist(true);
    setWaitlistMessage("");
    try {
      await joinWaitlist(currentUser.id, professionalId, selectedTakenSlot);
      setWaitlistMessage("Você entrou na fila! Avisaremos por e-mail se esse horário abrir.");
    } catch (error) {
      reportError(error, { flow: "profilePage.joinWaitlist" });
      setWaitlistMessage("Não foi possível entrar na fila. Tente novamente.");
    } finally {
      setJoiningWaitlist(false);
    }
  };

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
      // professionalId can be either the raw UUID (old links, /perfil/{uuid}) or a friendly slug
      // (/perfil/{slug}) — resolve to the real row (and its real id) first, since every other
      // query below filters on professional_id and needs the UUID, not whatever string was in the URL.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(professionalId);
      const { data: proData, error: proError } = await supabase
        .from("professional_profiles")
        .select("id, bio, specialties, approaches, license_type, license_number, session_price, modalities, city, state, insurances, years_experience, cover_url, accent_color, profiles(full_name, avatar_url)")
        .eq(isUuid ? "id" : "slug", professionalId)
        .maybeSingle();

      if (!active) return;

      if (proError || !proData) {
        setLoadError("Não foi possível carregar este profissional.");
        setLoading(false);
        return;
      }

      const resolvedId = (proData as any).id as string;

      const [{ data: availData }, { data: reviewData }, { data: blockData }, locData, svcData] = await Promise.all([
        supabase
          .from("professional_availability")
          .select("weekday, start_time, end_time")
          .eq("professional_id", resolvedId)
          .not("weekday", "is", null),
        supabase
          .from("reviews")
          .select("rating, comment, profiles(full_name)")
          .eq("professional_id", resolvedId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("professional_time_blocks")
          .select("start_at, end_at")
          .eq("professional_id", resolvedId),
        listLocations(resolvedId).catch(() => []),
        listServices(resolvedId).catch(() => []),
      ]);

      if (!active) return;

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
        coverUrl: item.cover_url ?? null,
        accentColor: item.accent_color ?? null,
      });
      setAvailability((availData ?? []) as any);
      setReviews(((reviewData ?? []) as any[]).map(r => ({ name: r.profiles?.full_name ?? "Paciente", rating: r.rating, comment: r.comment })));
      setTimeBlocks(((blockData ?? []) as any[]).map(b => ({ startAt: b.start_at, endAt: b.end_at })));
      setLocations(locData);
      setServices(svcData);

      const now = new Date();
      const in14Days = new Date();
      in14Days.setDate(now.getDate() + 14);
      const { data: existing } = await supabase
        .from("appointments")
        .select("scheduled_at")
        .eq("professional_id", resolvedId)
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

  const upcomingDays = getUpcomingAvailableDays(availability, new Date(), 14, 5, timeBlocks);
  const slotsForDay = (day: Date) => generateSlotsForDay(availability, day, bookedTimes, 50, timeBlocks);

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
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex gap-5">
                <Skeleton className="w-24 h-24 rounded-2xl flex-shrink-0" />
                <div className="flex-1 space-y-3 pt-2">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-3.5 w-1/3" />
                  <div className="flex gap-2"><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-5 w-24 rounded-full" /></div>
                </div>
              </div>
            </Card>
            <Card className="p-6 space-y-3">
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </Card>
          </div>
          <Card className="p-6 space-y-3 h-fit">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </Card>
        </div>
      </div>
    );
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
        {pro.coverUrl && (
          <div className="h-40 w-full bg-cover bg-center" style={{ backgroundImage: `url(${pro.coverUrl})` }} />
        )}
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
              <Btn variant="primary" size="lg" onClick={goToAvailability} style={pro.accentColor ? { backgroundColor: pro.accentColor } : undefined}><Calendar size={16} />Agendar sessão</Btn>
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
            <div className="space-y-4">
              <Card className="p-6">
                <h2 className="font-semibold text-foreground font-display mb-3">Sobre mim</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{pro.bio}</p>
              </Card>

              {locations.length > 0 && (
                <Card className="p-6">
                  <h2 className="font-semibold text-foreground font-display mb-3 flex items-center gap-2"><MapPinned size={16} />Atendo em</h2>
                  <div className="space-y-1.5">
                    {locations.map(l => (
                      <p key={l.id} className="text-sm text-muted-foreground">
                        <span className="text-foreground font-medium">{l.label}</span>
                        {(l.addressCity || l.addressState) && ` — ${[l.addressCity, l.addressState].filter(Boolean).join(", ")}`}
                      </p>
                    ))}
                  </div>
                </Card>
              )}

              {services.length > 0 && (
                <Card className="p-6">
                  <h2 className="font-semibold text-foreground font-display mb-3">Serviços</h2>
                  <div className="space-y-1.5">
                    {services.filter(s => s.active).map(s => (
                      <p key={s.id} className="text-sm text-muted-foreground">
                        <span className="text-foreground font-medium">{s.name}</span> — {s.durationMinutes}min · R${s.price.toFixed(2).replace(".", ",")}
                      </p>
                    ))}
                  </div>
                </Card>
              )}
            </div>
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
                          title={s.taken ? "Horário ocupado — clique para entrar na fila de espera" : undefined}
                          onClick={() => {
                            if (s.taken) { setSelectedTakenSlot(s.iso); setSelectedSlot(null); setWaitlistMessage(""); }
                            else { setSelectedSlot(s.iso); setSelectedTakenSlot(null); }
                          }}
                          className={`py-2.5 rounded-xl text-xs font-medium transition-all ${s.taken ? "bg-muted text-muted-foreground/50 line-through hover:bg-amber-50 hover:text-amber-700" : selectedSlot === s.iso ? "bg-primary text-white" : "bg-muted hover:bg-secondary hover:text-primary"}`}
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
                  {selectedDay && selectedTakenSlot && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm font-medium text-foreground mb-2">
                        {WEEKDAY_LABELS[selectedDay.getDay()]} {String(selectedDay.getDate()).padStart(2, "0")} · {new Date(selectedTakenSlot).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} está ocupado.
                      </p>
                      <Btn variant="outline" size="sm" disabled={joiningWaitlist} onClick={handleJoinWaitlist}>
                        {joiningWaitlist ? "Entrando..." : "Entrar na fila de espera"}
                      </Btn>
                      {waitlistMessage && <p className="text-xs text-emerald-700 mt-2">{waitlistMessage}</p>}
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
  const [epsiDeclared, setEpsiDeclared] = useState(false);
  const isCRP = !licenseNumber.toUpperCase().includes("CRM");
  const [personType, setPersonType] = useState<"fisica" | "juridica">("fisica");
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [signupCouponCode, setSignupCouponCode] = useState("");
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

  useEffect(() => {
    if (mode !== "register" || userType !== "professional" || plans.length > 0) return;
    listPlans().then(list => {
      setPlans(list);
      setSelectedPlanId(prev => prev || list[0]?.id || "");
    }).catch(error => reportError(error, { flow: "loginPage.loadPlans" }));
  }, [mode, userType, plans.length]);

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
      if (userType === "professional" && isCRP && !epsiDeclared) {
        throw new Error("Confirme o registro no e-Psi (Resolução CFP nº 11/2018) para se cadastrar como psicólogo(a).");
      }
      if (userType === "professional" && personType === "juridica" && (!cnpj.trim() || !razaoSocial.trim())) {
        throw new Error("Informe o CNPJ e a razão social para cadastro como Pessoa Jurídica.");
      }
      if (userType === "professional" && !selectedPlanId) {
        throw new Error("Escolha um plano de assinatura para concluir o cadastro.");
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
            // time, regardless of confirmation status. plan_id makes the trigger also record a
            // 'pending' professional_subscriptions row — there's no session yet to call
            // create-asaas-subscription with directly, so the actual Asaas checkout happens
            // either right below (if a session comes back immediately) or later from "Meu plano"
            // in Configurações via "Pagar agora", which reuses this same pending row.
            ...(userType === "professional" && {
              license_type: licenseNumber.toUpperCase().includes("CRM") ? "CRM" : "CRP",
              license_number: licenseNumber.trim(),
              ...(isCRP && epsiDeclared ? { epsi_declared_at: new Date().toISOString() } : {}),
              person_type: personType,
              ...(personType === "juridica" && { cnpj: cnpj.trim(), razao_social: razaoSocial.trim() }),
              plan_id: selectedPlanId,
            }),
          },
        },
      });

      if (error) throw error;

      if (!data.session) {
        setAuthInfo("Cadastro criado. Confirme seu e-mail e depois finalize o pagamento da assinatura em Configurações.");
        setMode("login");
        return;
      }

      // Session exists (email confirmation disabled): go straight to Asaas checkout for the
      // plan just chosen instead of leaving a 'pending' subscription to notice later.
      if (userType === "professional" && selectedPlanId) {
        const subscriptionResult = await createSubscription(selectedPlanId, signupCouponCode.trim() || undefined);
        if (subscriptionResult.ok) {
          window.location.href = subscriptionResult.checkoutUrl;
          return;
        }
        // Coupon was invalid/expired, CPF/CNPJ missing, or Asaas hiccuped — account already exists
        // either way, so don't block onboarding: surface the message and let the redirect effect
        // below take them to the dashboard, where "Configurações → Meu plano" retries the same
        // pending row.
        if (signupCouponCode.trim()) setAuthInfo(subscriptionResult.error);
      }
      // Redirect happens once currentUser loads, see the "login" redirect effect near navigate().
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
            {mode === "register" && userType === "professional" && isCRP && (
              <label className="flex items-start gap-2 mt-3 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={epsiDeclared} onChange={e => setEpsiDeclared(e.target.checked)} className="mt-0.5 accent-primary" />
                <span>Declaro que meu atendimento psicológico mediado por tecnologia está registrado no sistema e-Psi do CFP, conforme exige a Resolução CFP nº 11/2018.</span>
              </label>
            )}
            {mode === "register" && userType === "professional" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Tipo de cadastro</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPersonType("fisica")} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${personType === "fisica" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>Pessoa Física</button>
                  <button type="button" onClick={() => setPersonType("juridica")} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${personType === "juridica" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>Pessoa Jurídica</button>
                </div>
              </div>
            )}
            {mode === "register" && userType === "professional" && personType === "juridica" && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="CNPJ" placeholder="00.000.000/0001-00" value={cnpj} onChange={setCnpj} />
                <Input label="Razão social" placeholder="Nome da empresa" value={razaoSocial} onChange={setRazaoSocial} />
              </div>
            )}
            {mode === "register" && userType === "professional" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Plano de assinatura</label>
                {plans.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Carregando planos...</p>
                ) : (
                  <div className="space-y-2">
                    {plans.map(plan => (
                      <label key={plan.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm cursor-pointer ${selectedPlanId === plan.id ? "border-primary bg-secondary" : "border-border"}`}>
                        <span className="flex items-center gap-2">
                          <input type="radio" name="signup-plan" checked={selectedPlanId === plan.id} onChange={() => setSelectedPlanId(plan.id)} className="accent-primary" />
                          <span className="font-medium text-foreground">{plan.name}</span>
                        </span>
                        <span className="text-muted-foreground">R${plan.price.toFixed(2).replace(".", ",")}/mês</span>
                      </label>
                    ))}
                  </div>
                )}
                <Input
                  label="Cupom de desconto (opcional)"
                  placeholder="Ex: BEMVINDO10"
                  icon={<Tag size={15} />}
                  value={signupCouponCode}
                  onChange={v => setSignupCouponCode(v.toUpperCase())}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">O pagamento é feito pelo Asaas logo em seguida (ou você pode concluir depois em Configurações → Meu plano, onde o cupom também pode ser aplicado).</p>
              </div>
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

          <Btn
            variant="primary"
            className="w-full justify-center mt-6"
            onClick={handleAuth}
            disabled={loading || (mode === "register" && (
              !acceptedTerms
              || (userType === "professional" && isCRP && !epsiDeclared)
              || (userType === "professional" && !selectedPlanId)
              || (userType === "professional" && personType === "juridica" && (!cnpj.trim() || !razaoSocial.trim()))
            ))}
          >
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

/** Public screen (no login) reached via the WhatsApp confirmation link — patient-confirmation.ts
 *  hits the confirm-attendance Edge Function directly with the per-appointment token. */
function ConfirmAttendanceScreen({ token, onNavigate }: { token: string | null; onNavigate: (s: Screen) => void }) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [result, setResult] = useState<{ patientName: string; professionalName: string; scheduledAt: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Link inválido.");
      return;
    }

    let active = true;
    void confirmAttendance(token).then(res => {
      if (!active) return;
      if (res.ok) {
        setResult({ patientName: res.patientName, professionalName: res.professionalName, scheduledAt: res.scheduledAt });
        setStatus("done");
      } else {
        setError(res.error);
        setStatus("error");
      }
    });

    return () => { active = false; };
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Calendar size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-display">Confirmação de presença</h1>
        </div>
        <Card className="p-8 text-center">
          {status === "loading" && <p className="text-sm text-muted-foreground">Confirmando sua presença...</p>}
          {status === "done" && result && (
            <div className="space-y-4">
              <CheckCircle size={40} className="mx-auto text-emerald-500" />
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Presença confirmada! Te esperamos.
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{result.patientName}, sua consulta com {result.professionalName} está confirmada para:</p>
                <p className="flex items-center justify-center gap-1 font-medium text-foreground">
                  <Clock size={14} />
                  {new Date(result.scheduledAt).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <Btn variant="primary" className="w-full justify-center" onClick={() => onNavigate("landing")}>Ir para o início</Btn>
            </div>
          )}
          {status === "error" && (
            <div className="space-y-4">
              <AlertCircle size={40} className="mx-auto text-red-500" />
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              <Btn variant="secondary" className="w-full justify-center" onClick={() => onNavigate("landing")}>Ir para o início</Btn>
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
  professionalId: string;
  professionalName: string;
  professionalImg: string;
};

/** Patient-facing equivalent of ProfessionalSettingsScreen's profile section — much smaller since
 *  patients have no bio/specialties/availability, just identity + password. */
function PatientSettingsPanel({ currentUser }: { currentUser: AppUser }) {
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  const [whatsappReminders, setWhatsappReminders] = useState(true);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  const [profileForm, setProfileForm] = useState<PatientProfileFormState>(EMPTY_PATIENT_PROFILE_FORM);
  const [loadingPatientProfile, setLoadingPatientProfile] = useState(true);
  const [savingPatientProfile, setSavingPatientProfile] = useState(false);
  const [patientProfileMessage, setPatientProfileMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("profiles").select("full_name, phone, avatar_url").eq("id", currentUser.id).maybeSingle();
      if (!active) return;
      if (data) {
        setFullName(data.full_name ?? currentUser.fullName);
        setPhone(data.phone ?? "");
        setAvatarUrl(data.avatar_url ?? "");
      }
      setLoading(false);
    })();
    (async () => {
      setLoadingPatientProfile(true);
      const profile = await getPatientProfile(currentUser.id).catch(() => null);
      if (!active) return;
      if (profile) {
        setWhatsappReminders(profile.whatsappRemindersEnabled);
        setProfileForm(patientProfileToFormState(profile));
      }
      setLoadingPatientProfile(false);
    })();
    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const handleSavePatientProfile = async () => {
    setSavingPatientProfile(true);
    setPatientProfileMessage("");
    try {
      await upsertPatientProfile(currentUser.id, {
        birthDate: profileForm.birthDate || null,
        cpf: profileForm.cpf || null,
        addressStreet: profileForm.addressStreet || null,
        addressNumber: profileForm.addressNumber || null,
        addressComplement: profileForm.addressComplement || null,
        addressNeighborhood: profileForm.addressNeighborhood || null,
        addressCity: profileForm.addressCity || null,
        addressState: profileForm.addressState || null,
        addressZip: profileForm.addressZip || null,
        emergencyContactName: profileForm.emergencyContactName || null,
        emergencyContactPhone: profileForm.emergencyContactPhone || null,
        emergencyContactRelationship: profileForm.emergencyContactRelationship || null,
        legalGuardianName: profileForm.legalGuardianName || null,
        legalGuardianCpf: profileForm.legalGuardianCpf || null,
        legalGuardianPhone: profileForm.legalGuardianPhone || null,
        legalGuardianRelationship: profileForm.legalGuardianRelationship || null,
        insuranceProvider: profileForm.insuranceProvider || null,
        insurancePlan: profileForm.insurancePlan || null,
        insuranceCardNumber: profileForm.insuranceCardNumber || null,
        clinicalHistory: profileForm.clinicalHistory || null,
      });
      setPatientProfileMessage("Ficha cadastral salva com sucesso.");
    } catch (error) {
      reportError(error, { flow: "patientSettings.savePatientProfile" });
      setPatientProfileMessage("Não foi possível salvar a ficha cadastral.");
    } finally {
      setSavingPatientProfile(false);
    }
  };

  const handleToggleWhatsappReminders = async (enabled: boolean) => {
    setWhatsappReminders(enabled);
    setSavingWhatsapp(true);
    try {
      await upsertPatientProfile(currentUser.id, { whatsappRemindersEnabled: enabled });
    } catch (error) {
      reportError(error, { flow: "patientSettings.toggleWhatsappReminders" });
      setWhatsappReminders(!enabled);
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const handleUploadAvatar = async (file: File) => {
    setAvatarError("");
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(currentUser.id, file);
      setAvatarUrl(url);
    } catch (error) {
      reportError(error, { flow: "patientSettings.uploadAvatar" });
      setAvatarError(error instanceof Error ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveMessage("");
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim(), phone: phone.trim() || null }).eq("id", currentUser.id);
    setSaving(false);
    if (error) {
      reportError(error, { flow: "patientSettings.saveProfile" });
      setSaveMessage("Não foi possível salvar. Tente novamente.");
      return;
    }
    setSaveMessage("Dados atualizados com sucesso.");
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem.");
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      reportError(error, { flow: "patientSettings.updatePassword" });
      setPasswordError(error.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Senha alterada com sucesso.");
  };

  return (
    <div className="space-y-6">
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6">
        <h3 className="font-semibold text-foreground font-display mb-4">Meus dados</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <PhotoOrInitials src={avatarUrl || undefined} name={fullName} className="w-16 h-16 rounded-2xl object-cover bg-secondary" />
              <div>
                <label className="text-sm font-medium text-primary cursor-pointer hover:underline">
                  {uploadingAvatar ? "Enviando..." : "Trocar foto"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingAvatar}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadAvatar(file);
                    }}
                  />
                </label>
                {avatarError && <p className="text-xs text-red-600 mt-1">{avatarError}</p>}
              </div>
            </div>
            <Input label="Nome completo" value={fullName} onChange={setFullName} />
            <Input label="Telefone" value={phone} onChange={setPhone} placeholder="(11) 90000-0000" />
            <Btn variant="primary" size="sm" disabled={saving || !fullName.trim()} onClick={handleSaveProfile}>
              {saving ? "Salvando..." : "Salvar dados"}
            </Btn>
            {saveMessage && <p className="text-xs text-emerald-700">{saveMessage}</p>}
            <label className="flex items-center gap-2 text-sm text-foreground pt-2 border-t border-border">
              <input
                type="checkbox"
                checked={whatsappReminders}
                disabled={savingWhatsapp}
                onChange={e => void handleToggleWhatsappReminders(e.target.checked)}
              />
              Receber lembretes de consulta por WhatsApp
            </label>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-foreground font-display mb-4">Alterar senha</h3>
        <div className="space-y-4">
          <Input label="Nova senha" type="password" value={newPassword} onChange={setNewPassword} />
          <Input label="Confirmar nova senha" type="password" value={confirmPassword} onChange={setConfirmPassword} />
          {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
          <Btn variant="primary" size="sm" disabled={passwordSaving || !newPassword} onClick={handleChangePassword}>
            {passwordSaving ? "Salvando..." : "Alterar senha"}
          </Btn>
          {passwordMessage && <p className="text-xs text-emerald-700">{passwordMessage}</p>}
        </div>
      </Card>
    </div>

      <div>
        <h3 className="font-semibold text-foreground font-display mb-1">Ficha cadastral</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Esses dados ficam visíveis pro seu psicólogo/psiquiatra no prontuário, mas só você pode editá-los aqui.
        </p>
        {loadingPatientProfile ? (
          <Card className="p-6"><p className="text-sm text-muted-foreground">Carregando ficha cadastral...</p></Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5 space-y-4">
              <h4 className="font-semibold text-foreground font-display flex items-center gap-2"><User size={16} />Dados Pessoais</h4>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Data de nascimento" type="date" value={profileForm.birthDate} onChange={v => setProfileForm(f => ({ ...f, birthDate: v }))} />
                <Input label="CPF" placeholder="000.000.000-00" value={profileForm.cpf} onChange={v => setProfileForm(f => ({ ...f, cpf: v }))} />
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <h4 className="font-semibold text-foreground font-display flex items-center gap-2"><MapPin size={16} />Contatos e Endereço</h4>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Logradouro" value={profileForm.addressStreet} onChange={v => setProfileForm(f => ({ ...f, addressStreet: v }))} />
                <Input label="Número" value={profileForm.addressNumber} onChange={v => setProfileForm(f => ({ ...f, addressNumber: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Complemento" value={profileForm.addressComplement} onChange={v => setProfileForm(f => ({ ...f, addressComplement: v }))} />
                <Input label="Bairro" value={profileForm.addressNeighborhood} onChange={v => setProfileForm(f => ({ ...f, addressNeighborhood: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Cidade" value={profileForm.addressCity} onChange={v => setProfileForm(f => ({ ...f, addressCity: v }))} />
                <Input label="Estado (UF)" value={profileForm.addressState} onChange={v => setProfileForm(f => ({ ...f, addressState: v }))} />
              </div>
              <Input label="CEP" value={profileForm.addressZip} onChange={v => setProfileForm(f => ({ ...f, addressZip: v }))} className="max-w-xs" />
            </Card>

            <Card className="p-5 space-y-4">
              <h4 className="font-semibold text-foreground font-display flex items-center gap-2">
                <Shield size={16} />Responsável Legal <span className="text-xs font-normal text-muted-foreground">(se necessário)</span>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Nome" value={profileForm.legalGuardianName} onChange={v => setProfileForm(f => ({ ...f, legalGuardianName: v }))} />
                <Input label="CPF" value={profileForm.legalGuardianCpf} onChange={v => setProfileForm(f => ({ ...f, legalGuardianCpf: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Telefone" value={profileForm.legalGuardianPhone} onChange={v => setProfileForm(f => ({ ...f, legalGuardianPhone: v }))} />
                <Input label="Parentesco" value={profileForm.legalGuardianRelationship} onChange={v => setProfileForm(f => ({ ...f, legalGuardianRelationship: v }))} />
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <h4 className="font-semibold text-foreground font-display flex items-center gap-2">
                <CreditCard size={16} />Convênio <span className="text-xs font-normal text-muted-foreground">(se houver)</span>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Convênio" value={profileForm.insuranceProvider} onChange={v => setProfileForm(f => ({ ...f, insuranceProvider: v }))} />
                <Input label="Plano" value={profileForm.insurancePlan} onChange={v => setProfileForm(f => ({ ...f, insurancePlan: v }))} />
              </div>
              <Input label="Número da carteirinha" value={profileForm.insuranceCardNumber} onChange={v => setProfileForm(f => ({ ...f, insuranceCardNumber: v }))} className="max-w-xs" />
            </Card>

            <Card className="p-5 space-y-4">
              <h4 className="font-semibold text-foreground font-display flex items-center gap-2"><Heart size={16} />Contato de Emergência</h4>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Nome" value={profileForm.emergencyContactName} onChange={v => setProfileForm(f => ({ ...f, emergencyContactName: v }))} />
                <Input label="Telefone" value={profileForm.emergencyContactPhone} onChange={v => setProfileForm(f => ({ ...f, emergencyContactPhone: v }))} />
              </div>
              <Input label="Parentesco" value={profileForm.emergencyContactRelationship} onChange={v => setProfileForm(f => ({ ...f, emergencyContactRelationship: v }))} className="max-w-xs" />
            </Card>

            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-foreground font-display flex items-center gap-2"><Clipboard size={16} />Histórico</h4>
              <textarea
                value={profileForm.clinicalHistory}
                onChange={e => setProfileForm(f => ({ ...f, clinicalHistory: e.target.value }))}
                placeholder="Histórico relevante, queixa inicial, encaminhamentos..."
                className="w-full h-28 p-3 bg-input-background border border-border rounded-xl text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Card>

            {patientProfileMessage && (
              <p className={`text-xs ${patientProfileMessage.toLowerCase().includes("não foi") ? "text-red-600" : "text-emerald-600"}`}>{patientProfileMessage}</p>
            )}
            <div className="flex justify-end">
              <Btn variant="primary" onClick={handleSavePatientProfile} disabled={savingPatientProfile}>
                {savingPatientProfile ? "Salvando..." : "Salvar ficha cadastral"}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type PatientDashboardTab = "inicio" | "escalas" | "documentos" | "tarefas" | "mensagens" | "pagamentos" | "configuracoes";

const DASHBOARD_TAB_LABELS: Record<PatientDashboardTab, string> = {
  inicio: "Início",
  mensagens: "Mensagens",
  escalas: "Escalas psicológicas",
  documentos: "Documentos",
  tarefas: "Tarefas",
  pagamentos: "Pagamentos",
  configuracoes: "Configurações",
};

type PatientPayment = {
  id: string;
  amount: number;
  status: PaymentStatus;
  method: string;
  createdAt: string;
  scheduledAt: string;
  professionalName: string;
};

function PatientDashboard({ onNavigate, currentUser, onSignOut, onEnterVideo, initialTab }: AuthenticatedScreenProps & { onEnterVideo: (appointmentId: string) => void; initialTab?: PatientDashboardTab }) {
  const currentTime = useCurrentTime();
  const [dashboardTab, setDashboardTab] = useState<PatientDashboardTab>(initialTab ?? "inicio");

  const navItems = [
    { icon: <Home size={18} />, label: "Início", active: dashboardTab === "inicio", onClick: () => { setDashboardTab("inicio"); onNavigate("patient-dashboard"); } },
    { icon: <Calendar size={18} />, label: "Consultas", onClick: () => { setDashboardTab("inicio"); onNavigate("patient-dashboard"); } },
    { icon: <MessageSquare size={18} />, label: "Mensagens", active: dashboardTab === "mensagens", onClick: () => setDashboardTab("mensagens") },
    { icon: <FileText size={18} />, label: "Documentos", active: dashboardTab === "documentos", onClick: () => setDashboardTab("documentos") },
    { icon: <CreditCard size={18} />, label: "Pagamentos", active: dashboardTab === "pagamentos", onClick: () => setDashboardTab("pagamentos") },
    { icon: <Settings size={18} />, label: "Configurações", active: dashboardTab === "configuracoes", onClick: () => setDashboardTab("configuracoes") },
  ];

  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [totalInvested, setTotalInvested] = useState(0);
  const [paymentHistory, setPaymentHistory] = useState<PatientPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [assessmentHistory, setAssessmentHistory] = useState<{ id: string; templateName: string; totalScore: number; severity: string; createdAt: string }[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(true);
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;
  const questions = selectedTemplate?.questions ?? [];
  const [answers, setAnswers] = useState<number[]>([]);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [assessmentMessage, setAssessmentMessage] = useState("");

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    setAnswers(new Array(template?.questions.length ?? 0).fill(-1));
    setAssessmentMessage("");
  };

  useEffect(() => {
    listTemplates().then(list => {
      setTemplates(list);
      if (list.length > 0) handleSelectTemplate(list[0].id);
    }).catch(error => reportError(error, { flow: "patientDashboard.loadTemplates" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const loadAssessments = async () => {
    setLoadingAssessments(true);
    const { data } = await supabase
      .from("assessment_responses")
      .select("id, total_score, severity, created_at, assessment_templates(name)")
      .eq("patient_id", currentUser.id)
      .order("created_at", { ascending: false });
    setAssessmentHistory(((data ?? []) as any[]).map(d => ({
      id: d.id,
      templateName: d.assessment_templates?.name ?? "Escala removida",
      totalScore: d.total_score,
      severity: d.severity,
      createdAt: d.created_at,
    })));
    setLoadingAssessments(false);
  };

  useEffect(() => {
    void loadAssessments();
  }, [currentUser.id]);

  const handleSubmitAssessment = async () => {
    if (!selectedTemplate) return;
    if (answers.some(a => a < 0)) {
      setAssessmentMessage("Responda todas as perguntas antes de enviar.");
      return;
    }
    setSubmittingAssessment(true);
    setAssessmentMessage("");
    const { totalScore, severity } = scoreFromTemplate(answers, selectedTemplate.severityBands);
    const { error } = await supabase.from("assessment_responses").insert({
      patient_id: currentUser.id,
      template_id: selectedTemplate.id,
      answers,
      total_score: totalScore,
      severity,
    });
    setSubmittingAssessment(false);
    if (error) {
      reportError(error, { flow: "patientDashboard.submitAssessment" });
      setAssessmentMessage("Não foi possível enviar. Tente novamente.");
      return;
    }
    setAssessmentMessage(`Enviado! Pontuação: ${totalScore} (${severity})`);
    setAnswers(new Array(questions.length).fill(-1));
    void loadAssessments();
  };

  const [materials, setMaterials] = useState<PatientMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [tasks, setTasks] = useState<PatientTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDocument[]>([]);
  const [loadingGeneratedDocs, setLoadingGeneratedDocs] = useState(true);
  const [printingDocId, setPrintingDocId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingMaterials(true);
      const data = await listMaterialsForPatient(currentUser.id).catch(() => []);
      if (active) { setMaterials(data); setLoadingMaterials(false); }
    })();
    (async () => {
      setLoadingGeneratedDocs(true);
      const data = await listGeneratedDocuments(currentUser.id).catch(() => []);
      if (active) { setGeneratedDocs(data); setLoadingGeneratedDocs(false); }
    })();
    return () => { active = false; };
  }, [currentUser.id]);

  const loadTasks = async () => {
    setLoadingTasks(true);
    const data = await listTasksForPatient(currentUser.id).catch(() => []);
    setTasks(data);
    setLoadingTasks(false);
  };

  useEffect(() => {
    void loadTasks();
  }, [currentUser.id]);

  const handleViewMaterial = async (storagePath: string) => {
    try {
      const url = await getMaterialSignedUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      reportError(error, { flow: "patientDashboard.viewMaterial" });
    }
  };

  const handleViewGeneratedDocument = async (storagePath: string) => {
    try {
      const url = await getGeneratedDocumentSignedUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      reportError(error, { flow: "patientDashboard.viewGeneratedDocument" });
    }
  };

  const handlePrintGeneratedDocument = async (doc: GeneratedDocument) => {
    setPrintingDocId(doc.id);
    try {
      await printGeneratedDocument(doc.storagePath);
    } catch (error) {
      reportError(error, { flow: "patientDashboard.printGeneratedDocument" });
    } finally {
      setPrintingDocId(null);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, completedAt: completed ? new Date().toISOString() : null } : t)));
    try {
      await markTaskCompleted(taskId, completed);
    } catch (error) {
      reportError(error, { flow: "patientDashboard.toggleTask" });
      void loadTasks();
    }
  };

  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);

  const loadWaitlistEntries = async () => {
    const data = await listMyWaitlistEntries(currentUser.id).catch(() => []);
    setWaitlistEntries(data.filter(e => e.status === "waiting"));
  };

  useEffect(() => {
    void loadWaitlistEntries();
  }, [currentUser.id]);

  const handleLeaveWaitlist = async (entryId: string) => {
    setWaitlistEntries(prev => prev.filter(e => e.id !== entryId));
    try {
      await leaveWaitlist(entryId);
    } catch (error) {
      reportError(error, { flow: "patientDashboard.leaveWaitlist" });
      void loadWaitlistEntries();
    }
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!window.confirm("Cancelar esta consulta? Essa ação não pode ser desfeita.")) return;
    const appointment = appointments.find(a => a.id === appointmentId);
    setCancellingId(appointmentId);
    const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
    setCancellingId(null);
    if (error) {
      reportError(error, { flow: "patientDashboard.cancelAppointment" });
      window.alert("Não foi possível cancelar a consulta. Tente novamente.");
      return;
    }
    setAppointments(prev => prev.map(a => (a.id === appointmentId ? { ...a, status: "cancelled" } : a)));
    if (appointment) void notifyWaitlistMatch(appointment.professionalId, appointment.scheduledAt);
  };

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, modality, status, price, professional_id, professional_profiles(profiles(full_name, avatar_url))")
        .eq("patient_id", currentUser.id)
        .order("scheduled_at", { ascending: true });

      if (!active) return;

      const rows: PatientAppointment[] = ((data ?? []) as any[]).map(a => ({
        id: a.id,
        scheduledAt: a.scheduled_at,
        modality: a.modality,
        status: a.status,
        price: Number(a.price),
        professionalId: a.professional_id,
        professionalName: a.professional_profiles?.profiles?.full_name ?? "Profissional",
        professionalImg: a.professional_profiles?.profiles?.avatar_url ?? "",
      }));
      setAppointments(rows);

      const ids = rows.map(r => r.id);
      if (ids.length) {
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("id, amount, status, method, created_at, appointment_id")
          .in("appointment_id", ids);

        if (active) {
          const paid = (paymentsData ?? []).filter(p => p.status === "paid");
          setTotalInvested(paid.reduce((sum, p) => sum + Number(p.amount), 0));

          const byAppointmentId = new Map(rows.map(r => [r.id, r]));
          const history: PatientPayment[] = (paymentsData ?? [])
            .map(p => {
              const appointment = byAppointmentId.get(p.appointment_id);
              if (!appointment) return null;
              return {
                id: p.id,
                amount: Number(p.amount),
                status: p.status,
                method: p.method,
                createdAt: p.created_at,
                scheduledAt: appointment.scheduledAt,
                professionalName: appointment.professionalName,
              };
            })
            .filter((p): p is PatientPayment => p !== null)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setPaymentHistory(history);
        }
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const now = new Date(currentTime);
  const upcoming = appointments.filter(a => a.status === "scheduled" && new Date(a.scheduledAt) >= now);
  const past = appointments.filter(a => a.status !== "scheduled" || new Date(a.scheduledAt) < now);
  const completedCount = appointments.filter(a => a.status === "completed").length;
  const distinctProfessionals = new Set(appointments.map(a => a.professionalName)).size;
  const firstName = currentUser.fullName.split(" ")[0];

  const professionalCounterparts: MessagingCounterpart[] = Array.from(
    new Map(appointments.map(a => [a.professionalId, { id: a.professionalId, name: a.professionalName, img: a.professionalImg }])).values()
  );

  const nextSessionLabel = upcoming.length
    ? new Date(upcoming[0].scheduledAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" }) +
      " às " + new Date(upcoming[0].scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <AppShell title="Meu Painel" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => setDashboardTab("mensagens")}>
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

        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {(["inicio", "mensagens", "escalas", "documentos", "tarefas", "pagamentos", "configuracoes"] as const).map(t => (
            <button key={t} onClick={() => setDashboardTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-all ${dashboardTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {DASHBOARD_TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {dashboardTab === "inicio" && (
        <>
        {/* Upcoming */}
        <div>
          <h2 className="text-base font-semibold text-foreground font-display mb-3">Próximas consultas</h2>
          {!loading && upcoming.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">Você ainda não tem consultas agendadas.</p>
              <Btn variant="primary" size="sm" onClick={() => onNavigate("directory")}><Search size={14} />Encontrar terapeuta</Btn>
            </Card>
          )}
          <div className="space-y-3">
            {loading && <SkeletonAppointmentRow />}
            {loading && <SkeletonAppointmentRow />}
            {!loading && upcoming.map(a => (
              <Card key={a.id} className="p-4 flex items-center gap-4">
                <PhotoOrInitials src={a.professionalImg || undefined} name={a.professionalName} className="w-12 h-12 rounded-2xl object-cover bg-secondary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{a.professionalName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(a.scheduledAt).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · {new Date(a.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {a.modality === "online" ? "Online" : "Presencial"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {a.modality === "online" && canEnterSession(a.scheduledAt, currentTime) && (
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

        {waitlistEntries.length > 0 && (
          <Card className="p-5">
            <h3 className="font-semibold text-foreground font-display mb-3">Na fila de espera</h3>
            <div className="divide-y divide-border">
              {waitlistEntries.map(e => (
                <div key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                  <p className="text-sm text-foreground">
                    {new Date(e.desiredScheduledAt).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} às {new Date(e.desiredScheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <Btn variant="ghost" size="sm" onClick={() => handleLeaveWaitlist(e.id)}>Sair da fila</Btn>
                </div>
              ))}
            </div>
          </Card>
        )}

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
          {!loading && past.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma consulta anterior ainda.</p>}
          <div className="divide-y divide-border">
            {loading && <Skeleton className="h-12 w-full mb-2" />}
            {!loading && past.map(a => (
              <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.professionalName}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</p>
                </div>
                <Badge variant={a.status === "completed" ? "success" : a.status === "cancelled" ? "danger" : a.status === "no_show" ? "warning" : "outline"}>
                  {a.status === "completed" ? "Concluída" : a.status === "cancelled" ? "Cancelada" : a.status === "no_show" ? "Faltou" : a.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
        </>
        )}

        {dashboardTab === "mensagens" && (
          <MessagingPanel currentUser={currentUser} role="patient" counterparts={professionalCounterparts} loadingCounterparts={loading} />
        )}

        {dashboardTab === "pagamentos" && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground font-display">Histórico de pagamentos</h3>
              <p className="text-sm text-muted-foreground">Total investido: <strong className="text-foreground">R${totalInvested.toFixed(2).replace(".", ",")}</strong></p>
            </div>
            {loading && <p className="text-sm text-muted-foreground">Carregando pagamentos...</p>}
            {!loading && paymentHistory.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>}
            <div className="divide-y divide-border">
              {paymentHistory.map(p => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.professionalName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(p.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })} · {p.method === "pix" ? "Pix" : p.method === "card" ? "Cartão" : p.method}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">R${p.amount.toFixed(2).replace(".", ",")}</p>
                    <Badge variant={p.status === "paid" ? "success" : p.status === "refunded" ? "danger" : "outline"}>
                      {p.status === "paid" ? "Pago" : p.status === "refunded" ? "Reembolsado" : "Pendente"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {dashboardTab === "configuracoes" && (
          <PatientSettingsPanel currentUser={currentUser} />
        )}

        {dashboardTab === "escalas" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-semibold text-foreground font-display mb-1">Preencher escala</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Respostas ficam visíveis para o profissional que te atende, ajudando a acompanhar sua evolução ao longo do tempo.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {templates.map(t => (
                  <button key={t.id} onClick={() => handleSelectTemplate(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedTemplateId === t.id ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>
                    {t.name}
                  </button>
                ))}
              </div>
              {templates.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma escala disponível ainda.</p>}
              <div className="space-y-4">
                {questions.map((q, i) => (
                  <div key={i}>
                    <p className="text-sm text-foreground mb-2">{i + 1}. {q}</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedTemplate?.answerOptions ?? []).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setAnswers(prev => prev.map((v, idx) => (idx === i ? opt.value : v)))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${answers[i] === opt.value ? "bg-secondary text-primary border border-primary/30" : "bg-muted text-muted-foreground hover:bg-secondary border border-transparent"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {selectedTemplate && (
                <Btn variant="primary" className="w-full justify-center mt-5" disabled={submittingAssessment} onClick={handleSubmitAssessment}>
                  {submittingAssessment ? "Enviando..." : "Enviar respostas"}
                </Btn>
              )}
              {assessmentMessage && <p className="text-xs text-emerald-700 mt-2">{assessmentMessage}</p>}
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-foreground font-display mb-4">Suas respostas anteriores</h3>
              {loadingAssessments && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {!loadingAssessments && assessmentHistory.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma escala respondida ainda.</p>
              )}
              <div className="divide-y divide-border">
                {assessmentHistory.map(a => (
                  <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.templateName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{a.totalScore} pontos</p>
                      <p className="text-xs text-muted-foreground">{a.severity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {dashboardTab === "documentos" && (
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold text-foreground font-display mb-1">Documentos oficiais</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Declarações, relatórios, pareceres, laudos e encaminhamentos enviados pelo seu profissional.
              </p>
              {loadingGeneratedDocs && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {!loadingGeneratedDocs && generatedDocs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>}
              <div className="divide-y divide-border">
                {generatedDocs.map(doc => (
                  <div key={doc.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                    <button type="button" onClick={() => handleViewGeneratedDocument(doc.storagePath)} className="text-left text-sm text-foreground hover:text-primary flex items-center gap-2">
                      <FileText size={15} className="flex-shrink-0" />
                      <span>
                        {doc.documentType === "recibo" ? "Recibo" : DOCUMENT_TEMPLATE_LABELS[doc.documentType as DocumentTemplateType] ?? doc.documentType}
                        <span className="text-muted-foreground"> · {new Date(doc.sentToPatientAt ?? doc.createdAt).toLocaleDateString("pt-BR")}</span>
                      </span>
                    </button>
                    <Btn variant="ghost" size="sm" disabled={printingDocId === doc.id} onClick={() => handlePrintGeneratedDocument(doc)}>
                      <Printer size={13} />{printingDocId === doc.id ? "Preparando..." : "Imprimir"}
                    </Btn>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-foreground font-display mb-1">Documentos compartilhados</h3>
              <p className="text-xs text-muted-foreground mb-4">Materiais que seu profissional compartilhou com você.</p>
              {loadingMaterials && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {!loadingMaterials && materials.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento compartilhado ainda.</p>}
              <div className="divide-y divide-border">
                {materials.map(m => (
                  <button key={m.id} type="button" onClick={() => handleViewMaterial(m.storagePath)} className="w-full py-3 flex items-center gap-2 text-left text-sm text-foreground hover:text-primary">
                    <FileText size={15} className="flex-shrink-0" />{m.fileName}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {dashboardTab === "tarefas" && (
          <Card className="p-6">
            <h3 className="font-semibold text-foreground font-display mb-1">Tarefas</h3>
            <p className="text-xs text-muted-foreground mb-4">Exercícios e tarefas atribuídos pelo seu profissional.</p>
            {loadingTasks && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!loadingTasks && tasks.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa atribuída ainda.</p>}
            <div className="divide-y divide-border">
              {tasks.map(t => (
                <div key={t.id} className="py-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(t.completedAt)}
                    onChange={e => handleToggleTask(t.id, e.target.checked)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${t.completedAt ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.title}</p>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    {t.dueDate && <p className="text-xs text-muted-foreground mt-0.5">Prazo: {new Date(t.dueDate).toLocaleDateString("pt-BR")}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
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

const STATUS_COLORS: Record<string, string> = { scheduled: "#1B7A48", completed: "#5B8DEF", cancelled: "#D9E4DE", no_show: "#E8A33D" };
const STATUS_LABELS: Record<string, string> = { scheduled: "Agendadas", completed: "Concluídas", cancelled: "Canceladas", no_show: "Faltas" };

/** Shared by FinancialDashboard's "Sessões" list and EHRScreen's per-patient "Financeiro do
 *  paciente" statement — both render the same AppointmentWithPaymentStatus rows. */
const PAYMENT_STATUS_BADGE: Record<AppointmentWithPaymentStatus["paymentStatus"], { label: string; variant: "success" | "warning" | "outline" | "danger" }> = {
  paid: { label: "Pago", variant: "success" },
  pending: { label: "Pendente", variant: "warning" },
  refunded: { label: "Estornado", variant: "danger" },
  uncharged: { label: "Sem cobrança", variant: "outline" },
};

function ProfessionalDashboard({ onNavigate, currentUser, onSignOut, onEnterVideo }: AuthenticatedScreenProps & { onEnterVideo: (appointmentId: string) => void }) {
  const currentTime = useCurrentTime();
  const navItems = [
    { icon: <Home size={18} />, label: "Início", active: true, onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("patients") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <BookOpen size={18} />, label: "Biblioteca", onClick: () => onNavigate("library") },
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

  const now = new Date(currentTime);
  const upcoming = appointments.filter(a => a.status === "scheduled" && new Date(a.scheduledAt) >= now).slice(0, 5);
  const distinctPatients = new Set(appointments.map(a => a.patientName)).size;
  const thisMonthSessions = appointments.filter(a => {
    const d = new Date(a.scheduledAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const statusBreakdown = (["scheduled", "completed", "cancelled", "no_show"] as const)
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
    <AppShell title="Dashboard Profissional" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
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
                  {a.modality === "online" && canEnterSession(a.scheduledAt, currentTime) && (
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
  confirmedAt: string | null;
};

/** Only "scheduled" appointments starting within 24h and still unconfirmed get the "Não confirmada"
 *  badge — matches the same ~24h window send-appointment-reminder uses to request confirmation. */
function needsConfirmation(a: CalendarAppointment): boolean {
  if (a.status !== "scheduled" || a.confirmedAt) return false;
  const hoursUntil = (new Date(a.scheduledAt).getTime() - Date.now()) / (60 * 60 * 1000);
  return hoursUntil <= 24;
}

const CALENDAR_HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00–19:00
const CALENDAR_DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function CalendarScreen({ onNavigate, currentUser, onSignOut, onEnterVideo, onOpenEhr, activeProfessionalId, staffProfessionals, onChangeActiveProfessional, subscriptionUnlocked }: AuthenticatedScreenProps & {
  onEnterVideo: (appointmentId: string) => void; onOpenEhr: (patientId: string, appointmentId: string) => void;
  activeProfessionalId: string; staffProfessionals: ClinicProfessional[]; onChangeActiveProfessional: (id: string) => void;
  subscriptionUnlocked: boolean;
}) {
  const currentTime = useCurrentTime();
  const [view, setView] = useState<"week" | "month" | "day">("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  // Staff (secretária) only ever gets Agenda + Pacientes — the other nav items lead to screens
  // they're not allowed into (screenRoles in App() would bounce them back anyway, but there's no
  // reason to show dead-end links).
  const isStaff = currentUser.role === "staff";
  const navItems = isStaff ? [
    { icon: <Calendar size={18} />, label: "Agenda", active: true, onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("patients") },
  ] : [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", active: true, onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("patients") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <BookOpen size={18} />, label: "Biblioteca", onClick: () => onNavigate("library") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [availabilitySummary, setAvailabilitySummary] = useState("Nenhum horário definido ainda");
  const [selectedAppointment, setSelectedAppointment] = useState<CalendarAppointment | null>(null);

  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [sessionPrice, setSessionPrice] = useState(0);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newPatientId, setNewPatientId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newModality, setNewModality] = useState<"online" | "presencial">("online");
  const [newPrice, setNewPrice] = useState("");
  const [newDurationMinutes, setNewDurationMinutes] = useState(50);
  const [services, setServices] = useState<ProfessionalService[]>([]);
  const [newServiceId, setNewServiceId] = useState("");
  const [newRecurring, setNewRecurring] = useState(false);
  const [newRecurringCount, setNewRecurringCount] = useState(4);
  const [recurringReview, setRecurringReview] = useState<{ iso: string; conflict: boolean }[] | null>(null);
  const [newError, setNewError] = useState("");
  const [creating, setCreating] = useState(false);

  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMessage, setGoogleMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [timeBlocks, setTimeBlocks] = useState<{ id: string; startAt: string; endAt: string; reason: string | null }[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockStartDate, setBlockStartDate] = useState("");
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndDate, setBlockEndDate] = useState("");
  const [blockEndTime, setBlockEndTime] = useState("18:00");
  const [blockReason, setBlockReason] = useState("");
  const [blockError, setBlockError] = useState("");
  const [blockConflicts, setBlockConflicts] = useState<CalendarAppointment[] | null>(null);
  const [blocking, setBlocking] = useState(false);

  const reloadTimeBlocks = async () => {
    const { data } = await supabase
      .from("professional_time_blocks")
      .select("id, start_at, end_at, reason")
      .eq("professional_id", activeProfessionalId)
      .gte("end_at", new Date().toISOString())
      .order("start_at", { ascending: true });
    setTimeBlocks(((data ?? []) as any[]).map(b => ({ id: b.id, startAt: b.start_at, endAt: b.end_at, reason: b.reason })));
  };

  const openBlockModal = () => {
    setBlockError("");
    setBlockConflicts(null);
    const today = new Date().toISOString().slice(0, 10);
    setBlockStartDate(today);
    setBlockStartTime("09:00");
    setBlockEndDate(today);
    setBlockEndTime("18:00");
    setBlockReason("");
    setShowBlockModal(true);
  };

  /** First pass checks for conflicting scheduled appointments and, if any exist, stops to require
   *  explicit confirmation before cancelling them — a block never auto-cancels a patient's session. */
  const handleSubmitBlock = async () => {
    setBlockError("");

    if (!blockStartDate || !blockStartTime || !blockEndDate || !blockEndTime) {
      setBlockError("Selecione o início e o fim do bloqueio.");
      return;
    }

    const startAt = new Date(`${blockStartDate}T${blockStartTime}:00`);
    const endAt = new Date(`${blockEndDate}T${blockEndTime}:00`);

    if (endAt.getTime() <= startAt.getTime()) {
      setBlockError("O fim precisa ser depois do início.");
      return;
    }

    if (blockConflicts === null) {
      const conflicts = appointments.filter(a => {
        if (a.status !== "scheduled") return false;
        const scheduledAt = new Date(a.scheduledAt).getTime();
        return scheduledAt >= startAt.getTime() && scheduledAt < endAt.getTime();
      });

      if (conflicts.length > 0) {
        setBlockConflicts(conflicts);
        return;
      }
    }

    setBlocking(true);

    for (const conflict of blockConflicts ?? []) {
      const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", conflict.id);
      if (!error) void notifyWaitlistMatch(activeProfessionalId, conflict.scheduledAt);
    }

    const { error } = await supabase.from("professional_time_blocks").insert({
      professional_id: activeProfessionalId,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      reason: blockReason || null,
    });

    setBlocking(false);

    if (error) {
      reportError(error, { flow: "calendarScreen.createTimeBlock" });
      setBlockError("Não foi possível criar o bloqueio. Tente novamente.");
      return;
    }

    setShowBlockModal(false);
    setBlockConflicts(null);
    await Promise.all([reloadAppointments(), reloadTimeBlocks()]);
  };

  const handleDeleteTimeBlock = async (id: string) => {
    if (!window.confirm("Remover este bloqueio de horário?")) return;
    const { error } = await supabase.from("professional_time_blocks").delete().eq("id", id);
    if (error) {
      reportError(error, { flow: "calendarScreen.deleteTimeBlock" });
      window.alert("Não foi possível remover o bloqueio. Tente novamente.");
      return;
    }
    setTimeBlocks(prev => prev.filter(b => b.id !== id));
  };

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
    void notifyWaitlistMatch(activeProfessionalId, selectedAppointment.scheduledAt);
  };

  const [markingNoShow, setMarkingNoShow] = useState(false);

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  const openRescheduleModal = () => {
    if (!selectedAppointment) return;
    const current = new Date(selectedAppointment.scheduledAt);
    setRescheduleDate(current.toISOString().slice(0, 10));
    setRescheduleTime(current.toTimeString().slice(0, 5));
    setRescheduleError("");
    setShowRescheduleModal(true);
  };

  const handleRescheduleAppointment = async () => {
    if (!selectedAppointment) return;
    setRescheduleError("");

    if (!rescheduleDate || !rescheduleTime) {
      setRescheduleError("Selecione data e horário.");
      return;
    }

    const newScheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
    if (newScheduledAt.getTime() < Date.now()) {
      setRescheduleError("Escolha uma data e horário no futuro.");
      return;
    }

    setRescheduling(true);

    const { data: conflict } = await supabase
      .from("appointments")
      .select("id")
      .eq("professional_id", activeProfessionalId)
      .eq("scheduled_at", newScheduledAt.toISOString())
      .eq("status", "scheduled")
      .neq("id", selectedAppointment.id)
      .maybeSingle();

    if (conflict) {
      setRescheduling(false);
      setRescheduleError("Você já tem uma consulta marcada nesse horário.");
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .update({ scheduled_at: newScheduledAt.toISOString(), previous_scheduled_at: selectedAppointment.scheduledAt })
      .eq("id", selectedAppointment.id);

    setRescheduling(false);

    if (error) {
      reportError(error, { flow: "calendarScreen.rescheduleAppointment" });
      setRescheduleError("Não foi possível reagendar. Tente novamente.");
      return;
    }

    setShowRescheduleModal(false);
    setSelectedAppointment(null);
    await reloadAppointments();
  };

  const handleMarkNoShow = async () => {
    if (!selectedAppointment) return;
    if (!window.confirm("Marcar falta nesta consulta? O paciente não compareceu.")) return;
    setMarkingNoShow(true);
    const { error } = await supabase.from("appointments").update({ status: "no_show" }).eq("id", selectedAppointment.id);
    setMarkingNoShow(false);
    if (error) {
      reportError(error, { flow: "calendarScreen.markNoShow" });
      window.alert("Não foi possível marcar a falta. Tente novamente.");
      return;
    }
    setAppointments(prev => prev.map(a => (a.id === selectedAppointment.id ? { ...a, status: "no_show" } : a)));
    setSelectedAppointment(prev => (prev ? { ...prev, status: "no_show" } : prev));
  };

  const weekStart = getWeekStart(anchorDate);
  const weekDays = getWeekDays(weekStart);
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);

  const reloadAppointments = async () => {
    setLoadingAppointments(true);
    const { data } = await supabase
      .from("appointments")
      .select("id, scheduled_at, duration_minutes, modality, status, patient_id, google_event_id, confirmed_at, profiles(full_name)")
      .eq("professional_id", activeProfessionalId)
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
      confirmedAt: a.confirmed_at,
    })));
    setLoadingAppointments(false);
  };

  useEffect(() => {
    void reloadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfessionalId, anchorDate.getFullYear(), anchorDate.getMonth()]);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase
        .from("professional_availability")
        .select("weekday, start_time, end_time")
        .eq("professional_id", activeProfessionalId)
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
      const { data } = await supabase.from("appointments").select("patient_id, profiles(full_name)").eq("professional_id", activeProfessionalId);
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

    (async () => {
      const { data } = await supabase.from("professional_profiles").select("session_price").eq("id", activeProfessionalId).maybeSingle();
      if (active) setSessionPrice(Number(data?.session_price ?? 0));
    })();

    listServices(activeProfessionalId).then(list => { if (active) setServices(list.filter(s => s.active)); }).catch(() => {});

    void reloadTimeBlocks();

    return () => {
      active = false;
    };
  }, [activeProfessionalId]);

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
    setNewPrice(String(sessionPrice));
    setNewDurationMinutes(50);
    setNewServiceId("");
    setNewRecurring(false);
    setNewRecurringCount(4);
    setRecurringReview(null);
    setShowNewModal(true);
  };

  const handleSelectService = (serviceId: string) => {
    setNewServiceId(serviceId);
    const service = services.find(s => s.id === serviceId);
    if (service) {
      setNewPrice(String(service.price));
      setNewDurationMinutes(service.durationMinutes);
      if (service.modality) setNewModality(service.modality);
    }
  };

  /** Non-recurring: validates + creates in one step, unchanged. Recurring (weekly, 2–12 sessions):
   *  first pass checks every generated date for conflicts and shows a review list (conflicting
   *  dates are skipped, never silently double-booked); a second click on the same handler, with
   *  recurringReview already populated, creates the rows that came back conflict-free. */
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

    const priceValue = Number(newPrice);
    if (!newPrice || Number.isNaN(priceValue) || priceValue < 0) {
      setNewError("Informe um valor válido para a consulta.");
      return;
    }

    const firstScheduledAt = new Date(`${newDate}T${newTime}:00`);
    if (firstScheduledAt.getTime() < Date.now()) {
      setNewError("Escolha uma data e horário no futuro.");
      return;
    }

    const count = newRecurring ? Math.min(12, Math.max(2, newRecurringCount)) : 1;
    const scheduledDates = Array.from({ length: count }, (_, i) => {
      const d = new Date(firstScheduledAt);
      d.setDate(d.getDate() + 7 * i);
      return d;
    });

    if (count > 1 && recurringReview === null) {
      setCreating(true);
      const isoList = scheduledDates.map(d => d.toISOString());
      const { data: existing } = await supabase
        .from("appointments")
        .select("scheduled_at")
        .eq("professional_id", activeProfessionalId)
        .eq("status", "scheduled")
        .in("scheduled_at", isoList);
      setCreating(false);
      const takenSet = new Set((existing ?? []).map(a => a.scheduled_at));
      setRecurringReview(scheduledDates.map(d => ({ iso: d.toISOString(), conflict: takenSet.has(d.toISOString()) })));
      return;
    }

    setCreating(true);

    if (count === 1) {
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("professional_id", activeProfessionalId)
        .eq("scheduled_at", firstScheduledAt.toISOString())
        .eq("status", "scheduled")
        .maybeSingle();

      if (conflict) {
        setCreating(false);
        setNewError("Você já tem uma consulta marcada nesse horário.");
        return;
      }
    }

    const datesToCreate = count > 1
      ? (recurringReview ?? []).filter(r => !r.conflict).map(r => new Date(r.iso))
      : scheduledDates;

    if (datesToCreate.length === 0) {
      setCreating(false);
      setNewError("Todas as datas selecionadas já têm conflito. Ajuste antes de continuar.");
      return;
    }

    const { error } = await supabase.from("appointments").insert(
      datesToCreate.map(d => ({
        patient_id: newPatientId,
        professional_id: activeProfessionalId,
        scheduled_at: d.toISOString(),
        modality: newModality,
        price: priceValue,
        duration_minutes: newDurationMinutes,
      }))
    );

    setCreating(false);

    if (error) {
      reportError(error, { flow: "calendar.createAppointment" });
      setNewError("Não foi possível criar a consulta.");
      return;
    }

    setShowNewModal(false);
    setRecurringReview(null);
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
    <AppShell title="Agenda & Calendário" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
      <div className="space-y-4 h-full">
        {!subscriptionUnlocked && <SubscriptionLockedBanner onNavigate={onNavigate} />}
        {isStaff && staffProfessionals.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Atendendo por</label>
            <select
              value={activeProfessionalId}
              onChange={e => onChangeActiveProfessional(e.target.value)}
              className="px-3 py-1.5 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {staffProfessionals.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </div>
        )}
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
            <Btn variant="primary" size="sm" onClick={() => openNewAppointmentModal()} disabled={!subscriptionUnlocked}><Plus size={15} />Nova consulta</Btn>
            <Btn variant="outline" size="sm" onClick={openBlockModal} disabled={!subscriptionUnlocked}><Lock size={15} />Bloquear horário</Btn>
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
                            className={`rounded-lg border px-2 py-1 text-xs font-medium ${a.status === "cancelled" ? "bg-muted border-border text-muted-foreground line-through" : a.status === "no_show" ? "bg-amber-50 border-amber-200 text-amber-700 line-through" : a.modality === "online" ? "bg-primary/10 border-primary/30 text-primary" : "bg-blue-50 border-blue-200 text-blue-700"}`}
                          >
                            <p className="font-semibold truncate">{a.patientName}</p>
                            <p className="opacity-70">{a.modality === "online" ? "Online" : "Presencial"}</p>
                            {needsConfirmation(a) && <p className="mt-0.5 text-amber-700">Não confirmada</p>}
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
                  <div className="flex items-center gap-1.5">
                    {needsConfirmation(a) && <Badge variant="warning">Não confirmada</Badge>}
                    <Badge variant={a.status === "completed" ? "success" : a.status === "cancelled" ? "danger" : a.status === "no_show" ? "warning" : "outline"}>
                      {a.status === "completed" ? "Concluída" : a.status === "cancelled" ? "Cancelada" : a.status === "no_show" ? "Faltou" : a.modality === "online" ? "Online" : "Presencial"}
                    </Badge>
                  </div>
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

        {timeBlocks.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Horários bloqueados</h3>
            <div className="space-y-2">
              {timeBlocks.map(b => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-foreground font-medium truncate">
                      {new Date(b.startAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(b.endAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {b.reason && <p className="text-xs text-muted-foreground truncate">{b.reason}</p>}
                  </div>
                  <button type="button" onClick={() => handleDeleteTimeBlock(b.id)} disabled={!subscriptionUnlocked} className="flex-shrink-0 text-muted-foreground hover:text-red-600 disabled:opacity-40 disabled:pointer-events-none"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </Card>
        )}
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
              <div className="flex items-center gap-1.5 flex-wrap">
                {needsConfirmation(selectedAppointment) && <Badge variant="warning">Não confirmada</Badge>}
                <Badge variant={selectedAppointment.status === "completed" ? "success" : selectedAppointment.status === "cancelled" ? "danger" : selectedAppointment.status === "no_show" ? "warning" : "outline"}>
                  {selectedAppointment.status === "completed" ? "Concluída" : selectedAppointment.status === "cancelled" ? "Cancelada" : selectedAppointment.status === "no_show" ? "Faltou" : "Agendada"}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2 mt-5 flex-wrap">
              <Btn variant="outline" onClick={() => { onOpenEhr(selectedAppointment.patientId, selectedAppointment.id); onNavigate("ehr"); }}>Ver prontuário</Btn>
              {selectedAppointment.modality === "online" && selectedAppointment.status === "scheduled" && canEnterSession(selectedAppointment.scheduledAt, currentTime) && (
                <Btn variant="primary" onClick={() => { onEnterVideo(selectedAppointment.id); onNavigate("video"); }}><Video size={14} />Entrar</Btn>
              )}
              {selectedAppointment.status === "scheduled" && (
                <>
                  <Btn variant="outline" onClick={openRescheduleModal} disabled={!subscriptionUnlocked}><RefreshCw size={14} />Reagendar</Btn>
                  <Btn variant="outline" disabled={markingNoShow || !subscriptionUnlocked} onClick={handleMarkNoShow}>{markingNoShow ? "Marcando..." : "Marcar falta"}</Btn>
                  <Btn variant="danger" disabled={cancelling || !subscriptionUnlocked} onClick={handleCancelAppointment}>{cancelling ? "Cancelando..." : "Cancelar consulta"}</Btn>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showRescheduleModal && selectedAppointment && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowRescheduleModal(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">Reagendar consulta</h2>
              <button type="button" onClick={() => setShowRescheduleModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {selectedAppointment.patientName} — o horário muda, mas notas e histórico da consulta continuam os mesmos.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Nova data" type="date" value={rescheduleDate} onChange={setRescheduleDate} />
                <Input label="Novo horário" type="time" value={rescheduleTime} onChange={setRescheduleTime} />
              </div>
              {rescheduleError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{rescheduleError}</div>}
              <Btn variant="primary" className="w-full justify-center" onClick={handleRescheduleAppointment} disabled={rescheduling || !subscriptionUnlocked}>
                {rescheduling ? "Reagendando..." : "Confirmar novo horário"}
              </Btn>
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
            ) : recurringReview !== null ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Serão criadas {recurringReview.filter(r => !r.conflict).length} de {recurringReview.length} consultas semanais. Datas em conflito são puladas automaticamente.
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recurringReview.map(r => (
                    <div key={r.iso} className={`rounded-xl border px-3 py-2 text-sm flex items-center justify-between ${r.conflict ? "border-amber-200 bg-amber-50 text-amber-800" : "border-border"}`}>
                      <span>{new Date(r.iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      {r.conflict && <span className="text-xs">Conflito — pulada</span>}
                    </div>
                  ))}
                </div>
                {newError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{newError}</div>}
                <div className="flex gap-2">
                  <Btn variant="outline" className="flex-1 justify-center" onClick={() => setRecurringReview(null)} disabled={creating}>Voltar</Btn>
                  <Btn variant="primary" className="flex-1 justify-center" onClick={handleCreateAppointment} disabled={creating || !subscriptionUnlocked}>{creating ? "Criando..." : "Confirmar"}</Btn>
                </div>
              </div>
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
                {services.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Serviço (opcional)</label>
                    <select
                      value={newServiceId}
                      onChange={e => handleSelectService(e.target.value)}
                      className="px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Valor e duração padrão</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name} — {s.durationMinutes}min · R${s.price.toFixed(2).replace(".", ",")}</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Valor (R$)" type="number" value={newPrice} onChange={setNewPrice} />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Duração (min)</label>
                    <input
                      type="number"
                      value={newDurationMinutes}
                      onChange={e => setNewDurationMinutes(Number(e.target.value) || 50)}
                      className="px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="newRecurring" checked={newRecurring} onChange={e => setNewRecurring(e.target.checked)} className="w-4 h-4" />
                  <label htmlFor="newRecurring" className="text-sm text-foreground">Repetir semanalmente</label>
                </div>
                {newRecurring && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Número de sessões (2–12)</label>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={newRecurringCount}
                      onChange={e => setNewRecurringCount(Number(e.target.value))}
                      className="px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
                {newError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{newError}</div>}
                <Btn variant="primary" className="w-full justify-center" onClick={handleCreateAppointment} disabled={creating || !subscriptionUnlocked}>
                  {creating ? "Criando..." : newRecurring ? "Revisar consultas" : "Criar consulta"}
                </Btn>
              </div>
            )}
          </div>
        </div>
      )}

      {showBlockModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowBlockModal(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">Bloquear horário</h2>
              <button type="button" onClick={() => setShowBlockModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            {blockConflicts === null ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Compromisso pessoal, férias ou qualquer período em que você não pode atender. O horário deixa de aparecer como disponível para novos agendamentos.</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Início (data)" type="date" value={blockStartDate} onChange={setBlockStartDate} />
                  <Input label="Início (hora)" type="time" value={blockStartTime} onChange={setBlockStartTime} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Fim (data)" type="date" value={blockEndDate} onChange={setBlockEndDate} />
                  <Input label="Fim (hora)" type="time" value={blockEndTime} onChange={setBlockEndTime} />
                </div>
                <Input label="Motivo (opcional)" placeholder="Ex.: Compromisso pessoal" value={blockReason} onChange={setBlockReason} />
                {blockError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{blockError}</div>}
                <Btn variant="primary" className="w-full justify-center" onClick={handleSubmitBlock} disabled={blocking || !subscriptionUnlocked}>{blocking ? "Bloqueando..." : "Bloquear horário"}</Btn>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Este período tem {blockConflicts.length} consulta{blockConflicts.length > 1 ? "s" : ""} agendada{blockConflicts.length > 1 ? "s" : ""}. Bloquear o horário vai cancelá-la{blockConflicts.length > 1 ? "s" : ""}.
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {blockConflicts.map(a => (
                    <div key={a.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">{a.patientName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.scheduledAt).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  ))}
                </div>
                {blockError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{blockError}</div>}
                <div className="flex gap-2">
                  <Btn variant="outline" className="flex-1 justify-center" onClick={() => setBlockConflicts(null)} disabled={blocking}>Voltar</Btn>
                  <Btn variant="danger" className="flex-1 justify-center" onClick={handleSubmitBlock} disabled={blocking || !subscriptionUnlocked}>
                    {blocking ? "Cancelando..." : "Cancelar e bloquear"}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── Messaging (shared by PatientsScreen and PatientDashboard's "Mensagens" tab) ──────────────

type MessagingCounterpart = { id: string; name: string; img: string };

/** Two-pane chat: conversation list on the left, thread + composer on the right. `role` decides
 *  which side of (professional_id, patient_id) is "me" vs. the counterpart. */
function MessagingPanel({
  currentUser,
  role,
  counterparts,
  loadingCounterparts,
  onOpenRecord,
}: {
  currentUser: AppUser;
  role: "professional" | "patient";
  counterparts: MessagingCounterpart[];
  loadingCounterparts: boolean;
  onOpenRecord?: (counterpartId: string) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const threadIds = (counterpartId: string) => ({
    professionalId: role === "professional" ? currentUser.id : counterpartId,
    patientId: role === "professional" ? counterpartId : currentUser.id,
  });

  const loadConversations = async () => {
    const all = await listAllMessagesFor(currentUser.id, role).catch(() => []);
    setConversations(groupIntoConversations(all, currentUser.id, role));
  };

  useEffect(() => {
    void loadConversations();
  }, [currentUser.id, role]);

  useEffect(() => {
    setSelectedId(prev => prev ?? counterparts[0]?.id ?? null);
  }, [counterparts]);

  useEffect(() => {
    if (!selectedId) {
      setThread([]);
      return;
    }
    let active = true;
    setLoadingThread(true);
    const { professionalId, patientId } = threadIds(selectedId);
    (async () => {
      const data = await listThreadMessages(professionalId, patientId).catch(() => []);
      if (!active) return;
      setThread(data);
      setLoadingThread(false);
      await markThreadRead(professionalId, patientId, currentUser.id).catch(() => {});
      if (active) void loadConversations();
    })();
    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    return subscribeToMessages(currentUser.id, role, (message) => {
      const partnerId = role === "professional" ? message.patientId : message.professionalId;
      if (partnerId === selectedId) {
        setThread(prev => [...prev, message]);
        void markThreadRead(message.professionalId, message.patientId, currentUser.id).catch(() => {});
      }
      void loadConversations();
    });
  }, [currentUser.id, role, selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread]);

  const handleSend = async () => {
    if (!draft.trim() || !selectedId || sending) return;
    setSending(true);
    const { professionalId, patientId } = threadIds(selectedId);
    try {
      await sendMessage(professionalId, patientId, currentUser.id, draft);
      setDraft("");
    } catch (error) {
      reportError(error, { flow: "messaging.send" });
    } finally {
      setSending(false);
    }
  };

  const filteredCounterparts = counterparts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const conversationFor = (id: string) => conversations.find(c => c.counterpartId === id);
  const selected = counterparts.find(c => c.id === selectedId);

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[420px]">
      <Card className="p-0 overflow-hidden flex flex-col">
        <div className="p-3 border-b border-border">
          <Input placeholder="Buscar conversa..." value={search} onChange={setSearch} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingCounterparts && <p className="p-4 text-sm text-muted-foreground">Carregando...</p>}
          {!loadingCounterparts && filteredCounterparts.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa disponível ainda.</p>
          )}
          {filteredCounterparts.map(c => {
            const conversation = conversationFor(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-border/50 hover:bg-muted transition-colors ${selectedId === c.id ? "bg-secondary" : ""}`}
              >
                <PhotoOrInitials src={c.img || undefined} name={c.name} className="w-10 h-10 rounded-full object-cover bg-secondary flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    {!!conversation?.unreadCount && (
                      <span className="flex-shrink-0 bg-primary text-white text-[10px] font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{conversation?.lastMessage.content ?? "Nenhuma mensagem ainda"}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden flex flex-col">
        {!selected && (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Selecione uma conversa</div>
        )}
        {selected && (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PhotoOrInitials src={selected.img || undefined} name={selected.name} className="w-9 h-9 rounded-full object-cover bg-secondary" />
                <p className="text-sm font-semibold text-foreground">{selected.name}</p>
              </div>
              {onOpenRecord && (
                <Btn variant="outline" size="sm" onClick={() => onOpenRecord(selected.id)}>Ver prontuário</Btn>
              )}
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingThread && <p className="text-sm text-muted-foreground">Carregando conversa...</p>}
              {!loadingThread && thread.length === 0 && (
                <p className="text-sm text-muted-foreground text-center mt-8">Nenhuma mensagem ainda. Diga olá!</p>
              )}
              {thread.map(m => (
                <div key={m.id} className={`flex ${m.senderId === currentUser.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.senderId === currentUser.id ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className={`text-[10px] mt-1 ${m.senderId === currentUser.id ? "text-white/70" : "text-muted-foreground"}`}>
                      {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <input
                placeholder="Escreva uma mensagem..."
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                className="flex-1 px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <Btn variant="primary" onClick={handleSend} disabled={sending || !draft.trim()}><Send size={16} /></Btn>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── SCREEN: Patients (professional's patient list + messaging) ──────────────

function PatientsScreen({
  onNavigate,
  currentUser,
  onSignOut,
  onOpenEhr,
  activeProfessionalId,
  staffProfessionals,
  onChangeActiveProfessional,
  subscriptionUnlocked,
}: AuthenticatedScreenProps & {
  onOpenEhr: (patientId: string, appointmentId: string) => void;
  activeProfessionalId: string; staffProfessionals: ClinicProfessional[]; onChangeActiveProfessional: (id: string) => void;
  subscriptionUnlocked: boolean;
}) {
  const isStaff = currentUser.role === "staff";
  const navItems = isStaff ? [
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", active: true, onClick: () => onNavigate("patients") },
  ] : [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", active: true, onClick: () => onNavigate("patients") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <BookOpen size={18} />, label: "Biblioteca", onClick: () => onNavigate("library") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [patients, setPatients] = useState<EhrPatient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [tags, setTags] = useState<PatientTag[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const loadPatients = async () => {
    setLoadingPatients(true);
    const { data } = await supabase
      .from("appointments")
      .select("patient_id, profiles(full_name, avatar_url)")
      .eq("professional_id", activeProfessionalId);

    const map = new Map<string, EhrPatient>();
    ((data ?? []) as any[]).forEach(a => {
      const existing = map.get(a.patient_id);
      if (existing) existing.sessionsCount += 1;
      else map.set(a.patient_id, { id: a.patient_id, name: a.profiles?.full_name ?? "Paciente", img: a.profiles?.avatar_url ?? "", sessionsCount: 1 });
    });
    setPatients(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    setLoadingPatients(false);
  };

  useEffect(() => {
    void loadPatients();
    listTagsForProfessional(activeProfessionalId).then(setTags).catch(error => reportError(error, { flow: "patients.loadTags" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfessionalId]);

  const tagsByPatient = tags.reduce<Record<string, PatientTag[]>>((acc, tag) => {
    (acc[tag.patientId] ??= []).push(tag);
    return acc;
  }, {});
  const allTagLabels = Array.from(new Set(tags.map(t => t.label))).sort();
  const filteredPatients = tagFilter ? patients.filter(p => (tagsByPatient[p.id] ?? []).some(t => t.label === tagFilter)) : patients;

  const handleExportCsv = () => {
    downloadCsv("meus-pacientes.csv", [
      ["Nome", "Sessões", "Tags"],
      ...filteredPatients.map(p => [p.name, String(p.sessionsCount), (tagsByPatient[p.id] ?? []).map(t => t.label).join("; ")]),
    ]);
  };

  const handleDownloadCsvTemplate = () => {
    downloadCsv("modelo-importacao-pacientes.csv", [
      ["Nome", "E-mail", "Telefone", "Valor da consulta"],
      ["Ana Silva", "ana@example.com", "(11) 90000-0000", "150"],
    ]);
  };

  type CsvImportRow = { rowNumber: number; fullName: string; email: string; phone: string; price: string };
  type CsvImportError = { rowNumber: number; message: string };
  type CsvImportResult = { row: CsvImportRow; ok: boolean; error?: string };

  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<CsvImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<CsvImportError[]>([]);
  const [importResults, setImportResults] = useState<CsvImportResult[] | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImportFileSelected = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    const dataRows = rows.slice(1); // first row is the header
    const errors: CsvImportError[] = [];
    const seenEmails = new Set<string>();
    const valid: CsvImportRow[] = [];

    dataRows.forEach((cols, idx) => {
      const rowNumber = idx + 2; // 1-indexed, +1 for the header row
      const [fullName = "", email = "", phone = "", price = ""] = cols;

      if (!fullName.trim() || !email.trim()) {
        errors.push({ rowNumber, message: "Nome e e-mail são obrigatórios." });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (seenEmails.has(normalizedEmail)) {
        errors.push({ rowNumber, message: `E-mail duplicado no arquivo: ${email.trim()}` });
        return;
      }
      seenEmails.add(normalizedEmail);
      valid.push({ rowNumber, fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), price: price.trim() });
    });

    setImportRows(valid);
    setImportErrors(errors);
    setImportResults(null);
    setShowImportModal(true);
  };

  /** Every imported patient needs a first appointment (create-patient-account's bootstrap
   *  requirement — that's what makes them visible everywhere else in the app), but a spreadsheet
   *  import has no session date to use, so each one gets the same placeholder a week out; this is
   *  disclosed on screen before the professional confirms, and every date is freely editable
   *  afterward from the Agenda. */
  const handleConfirmImport = async () => {
    setImporting(true);
    const results: CsvImportResult[] = [];

    for (const row of importRows) {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 7);
      scheduledAt.setHours(9, 0, 0, 0);

      const result = await createPatientAccount({
        fullName: row.fullName,
        email: row.email,
        phone: row.phone || undefined,
        scheduledAt: scheduledAt.toISOString(),
        modality: "online",
        price: row.price ? Number(row.price) : undefined,
      });

      results.push({ row, ok: result.ok, error: result.ok ? undefined : result.error });
    }

    setImportResults(results);
    setImporting(false);
    await loadPatients();
  };

  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientEmail, setNewPatientEmail] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientDate, setNewPatientDate] = useState("");
  const [newPatientTime, setNewPatientTime] = useState("09:00");
  const [newPatientModality, setNewPatientModality] = useState<"online" | "presencial">("online");
  const [newPatientPrice, setNewPatientPrice] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [newPatientError, setNewPatientError] = useState("");
  const [patientInvited, setPatientInvited] = useState(false);

  const openNewPatientModal = () => {
    setNewPatientError("");
    setNewPatientName("");
    setNewPatientEmail("");
    setNewPatientPhone("");
    setNewPatientDate(new Date().toISOString().slice(0, 10));
    setNewPatientTime("09:00");
    setNewPatientModality("online");
    setNewPatientPrice("");
    setPatientInvited(false);
    setShowNewPatientModal(true);
    void supabase.from("professional_profiles").select("session_price").eq("id", activeProfessionalId).maybeSingle()
      .then(({ data }) => setNewPatientPrice(data?.session_price != null ? String(data.session_price) : ""));
  };

  const handleCreatePatient = async () => {
    setNewPatientError("");
    if (!newPatientName.trim() || !newPatientEmail.trim() || !newPatientDate || !newPatientTime) {
      setNewPatientError("Preencha nome, e-mail e a data/horário da primeira consulta.");
      return;
    }
    const scheduledAt = new Date(`${newPatientDate}T${newPatientTime}:00`);
    if (scheduledAt.getTime() < Date.now()) {
      setNewPatientError("Escolha uma data e horário no futuro pra primeira consulta.");
      return;
    }

    setCreatingPatient(true);
    const result = await createPatientAccount({
      fullName: newPatientName.trim(),
      email: newPatientEmail.trim(),
      phone: newPatientPhone.trim() || undefined,
      scheduledAt: scheduledAt.toISOString(),
      modality: newPatientModality,
      price: newPatientPrice ? Number(newPatientPrice) : undefined,
    });
    setCreatingPatient(false);

    if (!result.ok) {
      setNewPatientError(result.error);
      return;
    }

    setPatientInvited(true);
    await loadPatients();
  };

  return (
    <AppShell title="Pacientes" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
      {isStaff && staffProfessionals.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs font-medium text-muted-foreground">Atendendo por</label>
          <select
            value={activeProfessionalId}
            onChange={e => onChangeActiveProfessional(e.target.value)}
            className="px-3 py-1.5 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {staffProfessionals.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </div>
      )}
      {!subscriptionUnlocked && <SubscriptionLockedBanner onNavigate={onNavigate} />}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {allTagLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTagFilter(null)}
              className={`px-2 py-0.5 rounded-full text-xs border ${!tagFilter ? "border-primary text-primary bg-secondary" : "border-border text-muted-foreground"}`}
            >
              Todos
            </button>
            {allTagLabels.map(label => (
              <button
                key={label}
                onClick={() => setTagFilter(prev => (prev === label ? null : label))}
                className={`px-2 py-0.5 rounded-full text-xs border ${tagFilter === label ? "border-primary text-primary bg-secondary" : "border-border text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : <div />}
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={handleExportCsv} disabled={filteredPatients.length === 0}><Download size={14} />Exportar CSV</Btn>
          {!isStaff && (
            <>
              <label className={`cursor-pointer ${!subscriptionUnlocked ? "opacity-40 pointer-events-none" : ""}`}>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted">
                  <Upload size={14} />Importar CSV
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={!subscriptionUnlocked}
                  onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void handleImportFileSelected(file); }}
                />
              </label>
              <Btn variant="outline" size="sm" onClick={openNewPatientModal} disabled={!subscriptionUnlocked}><Plus size={14} />Cadastrar paciente</Btn>
            </>
          )}
        </div>
      </div>
      {!isStaff && (
        <MessagingPanel
          currentUser={currentUser}
          role="professional"
          counterparts={filteredPatients}
          loadingCounterparts={loadingPatients}
          onOpenRecord={(patientId) => { onOpenEhr(patientId, ""); onNavigate("ehr"); }}
        />
      )}

      {showNewPatientModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowNewPatientModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            {patientInvited ? (
              <>
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-lg font-bold text-foreground font-display">Paciente cadastrado</h2>
                  <button type="button" onClick={() => setShowNewPatientModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  A primeira consulta já foi agendada. Um e-mail de convite foi enviado para <span className="font-medium text-foreground">{newPatientEmail}</span> — o paciente define a própria senha por lá.
                </p>
                <Btn variant="primary" className="w-full justify-center" onClick={() => setShowNewPatientModal(false)}>Concluir</Btn>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-lg font-bold text-foreground font-display">Cadastrar paciente</h2>
                  <button type="button" onClick={() => setShowNewPatientModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Envia um convite por e-mail pro paciente (ele define a própria senha) e já agenda a primeira consulta com você.
                </p>
                <div className="space-y-3">
                  <Input label="Nome completo" value={newPatientName} onChange={setNewPatientName} />
                  <Input label="E-mail" type="email" value={newPatientEmail} onChange={setNewPatientEmail} />
                  <Input label="Telefone (opcional)" value={newPatientPhone} onChange={setNewPatientPhone} placeholder="(11) 90000-0000" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Data da 1ª consulta" type="date" value={newPatientDate} onChange={setNewPatientDate} />
                    <Input label="Horário" type="time" value={newPatientTime} onChange={setNewPatientTime} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setNewPatientModality("online")} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${newPatientModality === "online" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>Online</button>
                    <button type="button" onClick={() => setNewPatientModality("presencial")} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${newPatientModality === "presencial" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>Presencial</button>
                  </div>
                  <Input label="Valor da consulta (R$)" type="number" value={newPatientPrice} onChange={setNewPatientPrice} />
                  {newPatientError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{newPatientError}</div>}
                  <Btn variant="primary" className="w-full justify-center" onClick={handleCreatePatient} disabled={creatingPatient || !subscriptionUnlocked}>
                    {creatingPatient ? "Cadastrando..." : "Cadastrar e agendar"}
                  </Btn>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => !importing && setShowImportModal(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">Importar pacientes via CSV</h2>
              {!importing && <button type="button" onClick={() => setShowImportModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>}
            </div>

            {importResults ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  {importResults.filter(r => r.ok).length} de {importResults.length} pacientes importados com sucesso.
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {importResults.map(r => (
                    <div key={r.row.rowNumber} className={`rounded-xl border px-3 py-2 text-sm ${r.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                      <p className="font-medium">Linha {r.row.rowNumber} · {r.row.fullName}</p>
                      {!r.ok && <p className="text-xs mt-0.5">{r.error}</p>}
                    </div>
                  ))}
                </div>
                <Btn variant="primary" className="w-full justify-center" onClick={() => setShowImportModal(false)}>Concluir</Btn>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Colunas esperadas: Nome, E-mail, Telefone (opcional), Valor da consulta (opcional).{" "}
                  <button type="button" onClick={handleDownloadCsvTemplate} className="underline text-primary">Baixar modelo</button>
                </p>

                {importErrors.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 space-y-1">
                    <p className="font-medium">{importErrors.length} linha{importErrors.length > 1 ? "s" : ""} com problema — não {importErrors.length > 1 ? "serão" : "será"} importada{importErrors.length > 1 ? "s" : ""}:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {importErrors.map((e, i) => <p key={i} className="text-xs">Linha {e.rowNumber}: {e.message}</p>)}
                    </div>
                  </div>
                )}

                {importRows.length > 0 ? (
                  <>
                    <div className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                      Cada paciente importado já entra com uma 1ª consulta marcada para daqui a 7 dias, às 09:00 — é só um vínculo inicial, ajuste a data depois na Agenda.
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {importRows.map(row => (
                        <div key={row.rowNumber} className="rounded-xl border border-border px-3 py-2 text-sm">
                          <p className="font-medium text-foreground">{row.fullName}</p>
                          <p className="text-xs text-muted-foreground">{row.email}{row.phone ? ` · ${row.phone}` : ""}{row.price ? ` · R$${row.price}` : ""}</p>
                        </div>
                      ))}
                    </div>
                    <Btn variant="primary" className="w-full justify-center" onClick={handleConfirmImport} disabled={importing || !subscriptionUnlocked}>
                      {importing ? "Importando..." : `Importar ${importRows.length} paciente${importRows.length > 1 ? "s" : ""}`}
                    </Btn>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma linha válida encontrada no arquivo.</p>
                )}
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
type EhrSession = {
  id: string; scheduledAt: string; modality: string; status: string; notes: string; aiSummary: string | null;
  subjective?: JSONContent | null; objective?: JSONContent | null; assessment?: JSONContent | null; plan?: JSONContent | null;
  signedAt?: string | null; typedName?: string | null;
};

const EMPTY_PATIENT_PROFILE_FORM = {
  birthDate: "", cpf: "",
  addressStreet: "", addressNumber: "", addressComplement: "", addressNeighborhood: "", addressCity: "", addressState: "", addressZip: "",
  emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "",
  legalGuardianName: "", legalGuardianCpf: "", legalGuardianPhone: "", legalGuardianRelationship: "",
  insuranceProvider: "", insurancePlan: "", insuranceCardNumber: "",
  clinicalHistory: "",
};
type PatientProfileFormState = typeof EMPTY_PATIENT_PROFILE_FORM;

function patientProfileToFormState(profile: PatientProfile): PatientProfileFormState {
  return {
    birthDate: profile.birthDate ?? "",
    cpf: profile.cpf ?? "",
    addressStreet: profile.addressStreet ?? "",
    addressNumber: profile.addressNumber ?? "",
    addressComplement: profile.addressComplement ?? "",
    addressNeighborhood: profile.addressNeighborhood ?? "",
    addressCity: profile.addressCity ?? "",
    addressState: profile.addressState ?? "",
    addressZip: profile.addressZip ?? "",
    emergencyContactName: profile.emergencyContactName ?? "",
    emergencyContactPhone: profile.emergencyContactPhone ?? "",
    emergencyContactRelationship: profile.emergencyContactRelationship ?? "",
    legalGuardianName: profile.legalGuardianName ?? "",
    legalGuardianCpf: profile.legalGuardianCpf ?? "",
    legalGuardianPhone: profile.legalGuardianPhone ?? "",
    legalGuardianRelationship: profile.legalGuardianRelationship ?? "",
    insuranceProvider: profile.insuranceProvider ?? "",
    insurancePlan: profile.insurancePlan ?? "",
    insuranceCardNumber: profile.insuranceCardNumber ?? "",
    clinicalHistory: profile.clinicalHistory ?? "",
  };
}

function EHRScreen({ onNavigate, currentUser, onSignOut, initialPatientId, initialAppointmentId, subscriptionUnlocked }: AuthenticatedScreenProps & { initialPatientId?: string | null; initialAppointmentId?: string | null; subscriptionUnlocked: boolean }) {
  const [patientSearch, setPatientSearch] = useState("");
  const [ehrTab, setEhrTab] = useState<"cadastro" | "historico" | "notas" | "escalas" | "diario" | "materiais">("historico");
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("patients") },
    { icon: <FileText size={18} />, label: "Prontuários", active: true, onClick: () => onNavigate("ehr") },
    { icon: <BookOpen size={18} />, label: "Biblioteca", onClick: () => onNavigate("library") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [patients, setPatients] = useState<EhrPatient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const [showUpdateLinkModal, setShowUpdateLinkModal] = useState(false);
  const [updateLinkEmail, setUpdateLinkEmail] = useState("");
  const [sendingUpdateLink, setSendingUpdateLink] = useState(false);
  const [updateLinkMessage, setUpdateLinkMessage] = useState("");

  const handleSendUpdateLink = async () => {
    setUpdateLinkMessage("");
    if (!updateLinkEmail.trim()) return;
    setSendingUpdateLink(true);
    const { error } = await supabase.auth.resetPasswordForEmail(updateLinkEmail.trim(), {
      redirectTo: `${window.location.origin}/atualizar-cadastro`,
    });
    setSendingUpdateLink(false);
    if (error) {
      reportError(error, { flow: "ehr.sendUpdateLink" });
      setUpdateLinkMessage("Não foi possível enviar o link. Confira o e-mail e tente novamente.");
      return;
    }
    setUpdateLinkMessage("Link enviado! O paciente recebe um e-mail com o acesso direto à ficha cadastral.");
  };

  const [tags, setTags] = useState<PatientTag[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagColor, setNewTagColor] = useState<PatientTagColor>("green");
  const [savingTag, setSavingTag] = useState(false);

  const loadTags = async () => {
    try {
      setTags(await listTagsForProfessional(currentUser.id));
    } catch (error) {
      reportError(error, { flow: "ehr.loadTags" });
    }
  };

  useEffect(() => {
    void loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const tagsByPatient = tags.reduce<Record<string, PatientTag[]>>((acc, tag) => {
    (acc[tag.patientId] ??= []).push(tag);
    return acc;
  }, {});
  const allTagLabels = Array.from(new Set(tags.map(t => t.label))).sort();

  const handleAddTag = async () => {
    if (!selectedPatientId || !newTagLabel.trim()) return;
    setSavingTag(true);
    try {
      await createPatientTag(currentUser.id, selectedPatientId, newTagLabel.trim(), newTagColor);
      setNewTagLabel("");
      await loadTags();
    } catch (error) {
      reportError(error, { flow: "ehr.addTag" });
    } finally {
      setSavingTag(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      await deletePatientTag(tagId);
      await loadTags();
    } catch (error) {
      reportError(error, { flow: "ehr.deleteTag" });
    }
  };

  const [sessions, setSessions] = useState<EhrSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [subjectiveDraft, setSubjectiveDraft] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [objectiveDraft, setObjectiveDraft] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [assessmentDraft, setAssessmentDraft] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [planDraft, setPlanDraft] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showSignModal, setShowSignModal] = useState(false);
  const [signTypedName, setSignTypedName] = useState("");
  const [signing, setSigning] = useState(false);

  const [improvingField, setImprovingField] = useState<"subjective" | "objective" | "assessment" | "plan" | null>(null);
  const [transcribingField, setTranscribingField] = useState<"subjective" | "objective" | "assessment" | "plan" | null>(null);

  const SOAP_FIELD_SETTERS = {
    subjective: setSubjectiveDraft,
    objective: setObjectiveDraft,
    assessment: setAssessmentDraft,
    plan: setPlanDraft,
  } as const;

  const handleImproveSoapField = async (field: "subjective" | "objective" | "assessment" | "plan", currentValue: JSONContent) => {
    const plainText = tiptapJsonToPlainText(currentValue);
    if (!plainText.trim()) return;
    setImprovingField(field);
    try {
      const improved = await improveTextWithAI(plainText);
      if (improved) SOAP_FIELD_SETTERS[field](plainTextToTiptapJson(improved));
    } catch (error) {
      reportError(error, { flow: "ehr.improveSoapField" });
    } finally {
      setImprovingField(null);
    }
  };

  const handleTranscribeSoapField = async (field: "subjective" | "objective" | "assessment" | "plan", file: File) => {
    setTranscribingField(field);
    try {
      const text = await transcribeHandwriting(file);
      if (text) SOAP_FIELD_SETTERS[field](plainTextToTiptapJson(text));
      else window.alert("Não foi possível transcrever a imagem. Tente outra foto, com boa iluminação e foco.");
    } catch (error) {
      reportError(error, { flow: "ehr.transcribeSoapField" });
      window.alert("Não foi possível transcrever a imagem.");
    } finally {
      setTranscribingField(null);
    }
  };

  const [assessments, setAssessments] = useState<{ id: string; templateName: string; totalScore: number; severity: string; createdAt: string }[]>([]);
  const [loadingAssessmentsForPatient, setLoadingAssessmentsForPatient] = useState(false);

  useEffect(() => {
    if (!selectedPatientId) {
      setAssessments([]);
      return;
    }
    let active = true;
    setLoadingAssessmentsForPatient(true);
    (async () => {
      const { data } = await supabase
        .from("assessment_responses")
        .select("id, total_score, severity, created_at, assessment_templates(name)")
        .eq("patient_id", selectedPatientId)
        .order("created_at", { ascending: true });
      if (!active) return;
      setAssessments(((data ?? []) as any[]).map(d => ({
        id: d.id,
        templateName: d.assessment_templates?.name ?? "Escala removida",
        totalScore: d.total_score,
        severity: d.severity,
        createdAt: d.created_at,
      })));
      setLoadingAssessmentsForPatient(false);
    })();
    return () => {
      active = false;
    };
  }, [selectedPatientId]);

  const DEFAULT_ANSWER_OPTIONS: AnswerOption[] = [
    { value: 0, label: "Nunca" },
    { value: 1, label: "Vários dias" },
    { value: 2, label: "Mais da metade dos dias" },
    { value: 3, label: "Quase todos os dias" },
  ];

  const [myTemplates, setMyTemplates] = useState<AssessmentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateQuestions, setTemplateQuestions] = useState<string[]>([""]);
  const [templateBands, setTemplateBands] = useState<{ max: string; label: string }[]>([{ max: "", label: "" }]);
  const [templateError, setTemplateError] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadMyTemplates = async () => {
    setLoadingTemplates(true);
    try {
      setMyTemplates(await listTemplates());
    } catch (error) {
      reportError(error, { flow: "ehr.loadTemplates" });
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    void loadMyTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const openNewTemplateModal = () => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateQuestions([""]);
    setTemplateBands([{ max: "", label: "" }]);
    setTemplateError("");
    setShowTemplateModal(true);
  };

  const openEditTemplateModal = (t: AssessmentTemplate) => {
    setEditingTemplateId(t.id);
    setTemplateName(t.name);
    setTemplateQuestions(t.questions.length ? t.questions : [""]);
    setTemplateBands(
      t.severityBands.length ? t.severityBands.map(b => ({ max: b.max === null ? "" : String(b.max), label: b.label })) : [{ max: "", label: "" }]
    );
    setTemplateError("");
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    setTemplateError("");
    const questions = templateQuestions.map(q => q.trim()).filter(Boolean);
    if (!templateName.trim() || questions.length === 0) {
      setTemplateError("Informe um nome e pelo menos uma pergunta.");
      return;
    }
    const filledBands = templateBands.filter(b => b.label.trim());
    if (filledBands.length === 0) {
      setTemplateError("Informe pelo menos uma faixa de severidade.");
      return;
    }
    // The last band is always the catch-all (max: null) — whatever "até pontuação" was typed for
    // it is ignored, since a severity scale needs an open-ended top band by definition.
    const bands: SeverityBand[] = filledBands.map((b, i) => ({
      max: i === filledBands.length - 1 ? null : Number(b.max) || 0,
      label: b.label.trim(),
    }));

    setSavingTemplate(true);
    try {
      if (editingTemplateId) {
        await updateTemplate(editingTemplateId, templateName.trim(), questions, DEFAULT_ANSWER_OPTIONS, bands);
      } else {
        await createTemplate(currentUser.id, templateName.trim(), questions, DEFAULT_ANSWER_OPTIONS, bands);
      }
      setShowTemplateModal(false);
      await loadMyTemplates();
    } catch (error) {
      reportError(error, { flow: "ehr.saveTemplate" });
      setTemplateError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm("Excluir este modelo de escala? Isso falha se já houver respostas registradas com ele.")) return;
    try {
      await deleteTemplate(id);
      await loadMyTemplates();
    } catch (error) {
      reportError(error, { flow: "ehr.deleteTemplate" });
      window.alert("Não foi possível excluir — provavelmente já existem respostas registradas com este modelo.");
    }
  };

  const [profileForm, setProfileForm] = useState<PatientProfileFormState>(EMPTY_PATIENT_PROFILE_FORM);
  const [loadingPatientProfile, setLoadingPatientProfile] = useState(false);

  const [patientDocs, setPatientDocs] = useState<PatientDocument[]>([]);
  const [loadingPatientDocs, setLoadingPatientDocs] = useState(false);
  const [uploadingPatientDoc, setUploadingPatientDoc] = useState(false);
  const [patientDocError, setPatientDocError] = useState("");

  const loadPatientDocuments = async (patientId: string) => {
    setLoadingPatientDocs(true);
    try {
      setPatientDocs(await listPatientDocuments(patientId));
    } catch (error) {
      reportError(error, { flow: "ehr.loadPatientDocuments" });
    } finally {
      setLoadingPatientDocs(false);
    }
  };

  useEffect(() => {
    if (!selectedPatientId) {
      setProfileForm(EMPTY_PATIENT_PROFILE_FORM);
      setPatientDocs([]);
      return;
    }

    let active = true;
    setLoadingPatientProfile(true);

    (async () => {
      const profile = await getPatientProfile(selectedPatientId).catch(() => null);
      if (!active) return;
      setProfileForm(profile ? patientProfileToFormState(profile) : EMPTY_PATIENT_PROFILE_FORM);
      setLoadingPatientProfile(false);
    })();

    void loadPatientDocuments(selectedPatientId);

    return () => {
      active = false;
    };
  }, [selectedPatientId]);

  const handleUploadPatientDocument = async (file: File) => {
    if (!selectedPatientId) return;
    setPatientDocError("");
    setUploadingPatientDoc(true);
    try {
      await uploadPatientDocument(selectedPatientId, currentUser.id, file);
      await loadPatientDocuments(selectedPatientId);
    } catch (error) {
      reportError(error, { flow: "ehr.uploadPatientDocument" });
      setPatientDocError(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploadingPatientDoc(false);
    }
  };

  const handleViewPatientDocument = async (storagePath: string) => {
    try {
      const url = await getPatientDocumentSignedUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      reportError(error, { flow: "ehr.viewPatientDocument" });
    }
  };

  const handleDeletePatientDocument = async (doc: PatientDocument) => {
    if (!window.confirm(`Remover "${doc.fileName}"?`)) return;
    try {
      await deletePatientDocument(doc.id, doc.storagePath);
      if (selectedPatientId) await loadPatientDocuments(selectedPatientId);
    } catch (error) {
      reportError(error, { flow: "ehr.deletePatientDocument" });
    }
  };

  // ─ Biblioteca de Modelos: gera e assina declarações/relatórios/pareceres/laudos/encaminhamentos
  // a partir dos dados já carregados desta tela (paciente selecionado + ficha cadastral).
  const [templates, setTemplates] = useState<EffectiveTemplate[]>([]);
  const [professionalMeta, setProfessionalMeta] = useState({ license: "", city: "", logoUrl: null as string | null });
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDocument[]>([]);
  const [loadingGeneratedDocs, setLoadingGeneratedDocs] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateType, setGenerateType] = useState<DocumentTemplateType>("declaracao_comparecimento");
  const [generatePreview, setGeneratePreview] = useState("");
  const [generateTypedName, setGenerateTypedName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [improvingGenerateText, setImprovingGenerateText] = useState(false);

  const handleImproveGenerateText = async () => {
    if (!generatePreview.trim()) return;
    setImprovingGenerateText(true);
    try {
      const improved = await improveTextWithAI(generatePreview);
      if (improved) setGeneratePreview(improved);
    } catch (error) {
      reportError(error, { flow: "ehr.improveGenerateText" });
    } finally {
      setImprovingGenerateText(false);
    }
  };

  useEffect(() => {
    (async () => {
      const [templateList, { data: profRow }] = await Promise.all([
        listEffectiveTemplates(currentUser.id).catch(() => []),
        supabase.from("professional_profiles").select("license_type, license_number, city, logo_url").eq("id", currentUser.id).maybeSingle(),
      ]);
      setTemplates(templateList);
      if (profRow) setProfessionalMeta({ license: `${profRow.license_type} ${profRow.license_number}`.trim(), city: profRow.city ?? "", logoUrl: profRow.logo_url });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const loadGeneratedDocuments = async (patientId: string) => {
    setLoadingGeneratedDocs(true);
    try {
      setGeneratedDocs(await listGeneratedDocuments(patientId));
    } catch (error) {
      reportError(error, { flow: "ehr.loadGeneratedDocuments" });
    } finally {
      setLoadingGeneratedDocs(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) void loadGeneratedDocuments(selectedPatientId);
    else setGeneratedDocs([]);
  }, [selectedPatientId]);

  const [patientFinancials, setPatientFinancials] = useState<AppointmentWithPaymentStatus[]>([]);
  const [loadingPatientFinancials, setLoadingPatientFinancials] = useState(false);

  useEffect(() => {
    if (!selectedPatientId) {
      setPatientFinancials([]);
      return;
    }
    let active = true;
    setLoadingPatientFinancials(true);
    (async () => {
      const data = await listAppointmentsWithPaymentStatus(currentUser.id, selectedPatientId).catch(() => []);
      if (active) { setPatientFinancials(data); setLoadingPatientFinancials(false); }
    })();
    return () => { active = false; };
  }, [selectedPatientId, currentUser.id]);

  const openGenerateModal = () => {
    setGenerateError("");
    setGenerateTypedName("");
    const template = templates.find(t => t.type === generateType) ?? templates[0];
    if (template) {
      setGenerateType(template.type);
      const latestSession = sessions[0];
      const data = buildAutoFillData({
        patientName: selectedPatient?.name ?? "",
        patientCpf: profileForm.cpf || null,
        patientBirthDate: profileForm.birthDate || null,
        legalGuardianName: profileForm.legalGuardianName || null,
        professionalName: currentUser.fullName,
        professionalLicense: professionalMeta.license || "CRP",
        professionalCity: professionalMeta.city,
        scheduledAt: latestSession?.scheduledAt ?? null,
      });
      setGeneratePreview(fillTemplate(template.body, data));
    }
    setShowGenerateModal(true);
  };

  const handleChangeGenerateType = (type: DocumentTemplateType) => {
    const template = templates.find(t => t.type === type);
    setGenerateType(type);
    if (template) {
      const latestSession = sessions[0];
      const data = buildAutoFillData({
        patientName: selectedPatient?.name ?? "",
        patientCpf: profileForm.cpf || null,
        patientBirthDate: profileForm.birthDate || null,
        legalGuardianName: profileForm.legalGuardianName || null,
        professionalName: currentUser.fullName,
        professionalLicense: professionalMeta.license || "CRP",
        professionalCity: professionalMeta.city,
        scheduledAt: latestSession?.scheduledAt ?? null,
      });
      setGeneratePreview(fillTemplate(template.body, data));
    }
  };

  const handleGenerateDocument = async () => {
    if (!selectedPatientId || !generateTypedName.trim() || !generatePreview.trim()) return;
    setGenerating(true);
    setGenerateError("");
    try {
      const result = await generateAndSignDocument({
        documentType: generateType,
        title: DOCUMENT_TEMPLATE_LABELS[generateType],
        filledBody: generatePreview,
        patientId: selectedPatientId,
        professionalId: currentUser.id,
        appointmentId: sessions[0]?.id ?? null,
        typedName: generateTypedName.trim(),
        professionalLogoUrl: professionalMeta.logoUrl,
      });
      if (!result.signed) {
        setGenerateError("O documento foi gerado, mas não foi possível assinar. Tente novamente.");
        return;
      }
      setShowGenerateModal(false);
      await loadGeneratedDocuments(selectedPatientId);
    } catch (error) {
      reportError(error, { flow: "ehr.generateDocument" });
      setGenerateError("Não foi possível gerar o documento.");
    } finally {
      setGenerating(false);
    }
  };

  const handleViewGeneratedDocument = async (storagePath: string) => {
    try {
      const url = await getGeneratedDocumentSignedUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      reportError(error, { flow: "ehr.viewGeneratedDocument" });
    }
  };

  const [printingDocId, setPrintingDocId] = useState<string | null>(null);
  const [sendingDocId, setSendingDocId] = useState<string | null>(null);
  const [documentActionError, setDocumentActionError] = useState("");

  const handlePrintGeneratedDocument = async (doc: GeneratedDocument) => {
    setDocumentActionError("");
    setPrintingDocId(doc.id);
    try {
      await printGeneratedDocument(doc.storagePath);
    } catch (error) {
      reportError(error, { flow: "ehr.printGeneratedDocument" });
      setDocumentActionError("Não foi possível imprimir o documento.");
    } finally {
      setPrintingDocId(null);
    }
  };

  const handleSendGeneratedDocument = async (doc: GeneratedDocument) => {
    if (!selectedPatientId) return;
    setDocumentActionError("");
    setSendingDocId(doc.id);
    try {
      await markGeneratedDocumentSent(doc.id);
      const label = doc.documentType === "recibo" ? "Recibo" : DOCUMENT_TEMPLATE_LABELS[doc.documentType as DocumentTemplateType] ?? doc.documentType;
      void sendMessage(currentUser.id, selectedPatientId, currentUser.id, `📄 Novo documento disponível: ${label}`).catch(() => {});
      await loadGeneratedDocuments(selectedPatientId);
    } catch (error) {
      reportError(error, { flow: "ehr.sendGeneratedDocument" });
      setDocumentActionError("Não foi possível enviar o documento pro paciente.");
    } finally {
      setSendingDocId(null);
    }
  };

  const [materials, setMaterials] = useState<PatientMaterial[]>([]);
  const [tasks, setTasks] = useState<(PatientTask & { patientId: string })[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [materialError, setMaterialError] = useState("");
  const [shareWithAll, setShareWithAll] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [assigningTask, setAssigningTask] = useState(false);

  const loadMaterialsAndTasks = async () => {
    setLoadingMaterials(true);
    const [materialsData, tasksData] = await Promise.all([
      listMaterialsForProfessional(currentUser.id).catch(() => []),
      listTasksForProfessional(currentUser.id).catch(() => []),
    ]);
    setMaterials(materialsData);
    setTasks(tasksData);
    setLoadingMaterials(false);
  };

  useEffect(() => {
    void loadMaterialsAndTasks();
  }, [currentUser.id]);

  const handleUploadMaterial = async (file: File) => {
    setMaterialError("");
    setUploadingMaterial(true);
    try {
      await uploadPatientMaterial(currentUser.id, file, shareWithAll ? null : selectedPatientId);
      await loadMaterialsAndTasks();
    } catch (error) {
      reportError(error, { flow: "ehr.uploadMaterial" });
      setMaterialError(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploadingMaterial(false);
    }
  };

  const handleViewMaterial = async (storagePath: string) => {
    try {
      const url = await getMaterialSignedUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      reportError(error, { flow: "ehr.viewMaterial" });
    }
  };

  const handleDeleteMaterial = async (material: PatientMaterial) => {
    if (!window.confirm(`Remover "${material.fileName}"?`)) return;
    try {
      await deletePatientMaterial(material.id, material.storagePath);
      await loadMaterialsAndTasks();
    } catch (error) {
      reportError(error, { flow: "ehr.deleteMaterial" });
    }
  };

  const handleAssignTask = async () => {
    if (!selectedPatientId || !taskTitle.trim()) return;
    setAssigningTask(true);
    try {
      await assignTask(currentUser.id, selectedPatientId, taskTitle.trim(), taskDescription.trim(), taskDueDate || null);
      setTaskTitle("");
      setTaskDescription("");
      setTaskDueDate("");
      await loadMaterialsAndTasks();
    } catch (error) {
      reportError(error, { flow: "ehr.assignTask" });
    } finally {
      setAssigningTask(false);
    }
  };

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
        .select("id, scheduled_at, modality, status, session_notes(notes, subjective, objective, assessment, plan, signed_at, typed_name, ai_summary)")
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
          subjective: note?.subjective ?? null,
          objective: note?.objective ?? null,
          assessment: note?.assessment ?? null,
          plan: note?.plan ?? null,
          signedAt: note?.signed_at ?? null,
          typedName: note?.typed_name ?? null,
          aiSummary: note?.ai_summary ?? null,
        };
      });
      setSessions(rows);
      const preselected = initialAppointmentId && rows.some(r => r.id === initialAppointmentId) ? rows.find(r => r.id === initialAppointmentId)! : rows[0];
      setSelectedSessionId(preselected?.id ?? null);
      setSubjectiveDraft(preselected?.subjective ?? EMPTY_TIPTAP_DOC);
      setObjectiveDraft(preselected?.objective ?? EMPTY_TIPTAP_DOC);
      setAssessmentDraft(preselected?.assessment ?? EMPTY_TIPTAP_DOC);
      setPlanDraft(preselected?.plan ?? EMPTY_TIPTAP_DOC);
      setLoadingSessions(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedPatientId, currentUser.id]);

  const selectSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    setSelectedSessionId(id);
    setSubjectiveDraft(session?.subjective ?? EMPTY_TIPTAP_DOC);
    setObjectiveDraft(session?.objective ?? EMPTY_TIPTAP_DOC);
    setAssessmentDraft(session?.assessment ?? EMPTY_TIPTAP_DOC);
    setPlanDraft(session?.plan ?? EMPTY_TIPTAP_DOC);
    setSaveMessage("");
  };

  const handleSaveNotes = async () => {
    if (!selectedSessionId) return;
    setSaving(true);
    setSaveMessage("");

    const { error } = await supabase
      .from("session_notes")
      .upsert(
        {
          appointment_id: selectedSessionId,
          professional_id: currentUser.id,
          subjective: subjectiveDraft,
          objective: objectiveDraft,
          assessment: assessmentDraft,
          plan: planDraft,
        },
        { onConflict: "appointment_id" }
      );

    setSaving(false);

    if (error) {
      setSaveMessage("Não foi possível salvar a nota.");
      return;
    }

    setSessions(prev => prev.map(s => (s.id === selectedSessionId
      ? { ...s, subjective: subjectiveDraft, objective: objectiveDraft, assessment: assessmentDraft, plan: planDraft }
      : s)));
    setSaveMessage("Nota salva com segurança.");
  };

  const handleSignNote = async () => {
    if (!selectedSessionId || !signTypedName.trim()) return;
    setSigning(true);
    setSaveMessage("");
    try {
      const documentText = [subjectiveDraft, objectiveDraft, assessmentDraft, planDraft].map(tiptapJsonToPlainText).join("\n");
      const hash = await hashDocumentText(documentText);
      const ok = await signSessionNote(selectedSessionId, signTypedName.trim(), hash);
      if (!ok) {
        setSaveMessage("Não foi possível assinar a nota.");
        return;
      }
      const signedAt = new Date().toISOString();
      setSessions(prev => prev.map(s => (s.id === selectedSessionId ? { ...s, signedAt, typedName: signTypedName.trim() } : s)));
      setShowSignModal(false);
      setSignTypedName("");
      setSaveMessage("Nota assinada digitalmente com sucesso.");
    } catch (error) {
      reportError(error, { flow: "ehr.signNote" });
      setSaveMessage("Não foi possível assinar a nota.");
    } finally {
      setSigning(false);
    }
  };

  const ocrFileInputRef = useRef<HTMLInputElement>(null);
  const [ocrTargetField, setOcrTargetField] = useState<"subjective" | "objective" | "assessment" | "plan" | null>(null);

  const openOcrPicker = (field: "subjective" | "objective" | "assessment" | "plan") => {
    setOcrTargetField(field);
    ocrFileInputRef.current?.click();
  };

  const handleOcrFileChange = (e: any) => {
    const file = e.target.files?.[0] as File | undefined;
    e.target.value = "";
    if (file && ocrTargetField) void handleTranscribeSoapField(ocrTargetField, file);
  };

  /** Inserted image URLs are 7-day signed URLs (patient-documents is a private bucket, same RLS as
   *  every other patient attachment) — good enough for a note reviewed soon after it's written, but
   *  a note re-opened after the URL expires would show a broken image. A proper fix would resolve a
   *  stored storage path to a fresh signed URL at render time; out of scope for this pass. */
  const handleEditorImageUpload = async (patientId: string): Promise<string | null> => {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const path = `${patientId}/session-notes/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("patient-documents").upload(path, file);
          if (uploadError) throw uploadError;
          const { data, error: signError } = await supabase.storage.from("patient-documents").createSignedUrl(path, 60 * 60 * 24 * 7);
          if (signError || !data) throw signError ?? new Error("Sem URL assinada.");
          resolve(data.signedUrl);
        } catch (error) {
          reportError(error, { flow: "ehr.uploadNoteImage" });
          window.alert("Não foi possível enviar a imagem.");
          resolve(null);
        }
      };
      input.click();
    });
  };

  const [planningSession, setPlanningSession] = useState(false);
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(null);
  const [sessionPlanConsent, setSessionPlanConsent] = useState(false);
  const [sessionPlanError, setSessionPlanError] = useState("");

  useEffect(() => {
    setSessionPlan(null);
    setSessionPlanConsent(false);
    setSessionPlanError("");
  }, [selectedPatientId]);

  const handlePlanSession = async () => {
    if (!selectedPatientId) return;
    setPlanningSession(true);
    setSessionPlanError("");
    try {
      const plan = await planSessionWithAI(selectedPatientId);
      if (!plan) {
        setSessionPlanError("Não foi possível gerar sugestões. Tente novamente.");
        return;
      }
      setSessionPlan(plan);
    } catch (error) {
      reportError(error, { flow: "ehr.planSession" });
      setSessionPlanError("Não foi possível gerar sugestões.");
    } finally {
      setPlanningSession(false);
    }
  };

  const DIARY_LINE_COLORS = ["#1B7A48", "#3B6FA8", "#E8A33D", "#8B5CF6", "#EC4899"];
  const assessmentTemplateNames = Array.from(new Set(assessments.map(a => a.templateName)));
  const scoreChartData = Object.values(
    assessments.reduce<Record<string, any>>((acc, a) => {
      if (!acc[a.createdAt]) acc[a.createdAt] = { date: new Date(a.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), createdAt: a.createdAt };
      acc[a.createdAt][a.templateName] = a.totalScore;
      return acc;
    }, {})
  ).sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt));

  type DiaryEntry =
    | { type: "session"; date: string; id: string; excerpt: string; signedAt: string | null }
    | { type: "assessment"; date: string; id: string; templateName: string; totalScore: number; severity: string };

  const diaryEntries: DiaryEntry[] = [
    ...sessions
      .filter(s => s.subjective || s.objective || s.assessment || s.plan || s.notes)
      .map((s): DiaryEntry => ({
        type: "session",
        date: s.scheduledAt,
        id: s.id,
        excerpt: [s.subjective, s.objective, s.assessment, s.plan].map(tiptapJsonToPlainText).filter(Boolean).join(" · ") || s.notes,
        signedAt: s.signedAt ?? null,
      })),
    ...assessments.map((a): DiaryEntry => ({ type: "assessment", date: a.createdAt, id: a.id, templateName: a.templateName, totalScore: a.totalScore, severity: a.severity })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const filteredPatients = patients
    .filter(p => p.name.toLowerCase().includes(patientSearch.trim().toLowerCase()))
    .filter(p => !tagFilter || (tagsByPatient[p.id] ?? []).some(t => t.label === tagFilter));
  const selectedPatient = patients.find(p => p.id === selectedPatientId) ?? null;
  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null;

  return (
    <AppShell title="Prontuário Eletrônico" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
      {!subscriptionUnlocked && <SubscriptionLockedBanner onNavigate={onNavigate} />}
      <div className="flex gap-6 h-full">
        {/* Patient list */}
        <div className="w-64 flex-shrink-0">
          <div className="mb-3">
            <Input placeholder="Buscar paciente..." icon={<Search size={15} />} value={patientSearch} onChange={setPatientSearch} />
          </div>
          {allTagLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setTagFilter(null)}
                className={`px-2 py-0.5 rounded-full text-xs border ${!tagFilter ? "border-primary text-primary bg-secondary" : "border-border text-muted-foreground"}`}
              >
                Todos
              </button>
              {allTagLabels.map(label => (
                <button
                  key={label}
                  onClick={() => setTagFilter(prev => (prev === label ? null : label))}
                  className={`px-2 py-0.5 rounded-full text-xs border ${tagFilter === label ? "border-primary text-primary bg-secondary" : "border-border text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {loadingPatients && <p className="text-xs text-muted-foreground">Carregando pacientes...</p>}
          {!loadingPatients && filteredPatients.length === 0 && <p className="text-xs text-muted-foreground">Nenhum paciente encontrado.</p>}
          <div className="space-y-2">
            {filteredPatients.map(pt => (
              <button key={pt.id} onClick={() => setSelectedPatientId(pt.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${selectedPatientId === pt.id ? "bg-secondary border border-border" : "hover:bg-muted"}`}>
                <Avatar name={pt.name} src={pt.img || undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{pt.name}</p>
                  <p className="text-xs text-muted-foreground">{pt.sessionsCount} sessões</p>
                  {(tagsByPatient[pt.id] ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(tagsByPatient[pt.id] ?? []).map(t => (
                        <span key={t.id} className={`px-1.5 py-0.5 rounded-full text-[10px] border ${PATIENT_TAG_COLOR_CLASSES[t.color]}`}>{t.label}</span>
                      ))}
                    </div>
                  )}
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

                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  {(tagsByPatient[selectedPatient.id] ?? []).map(t => (
                    <span key={t.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${PATIENT_TAG_COLOR_CLASSES[t.color]}`}>
                      {t.label}
                      <button type="button" onClick={() => handleDeleteTag(t.id)} disabled={!subscriptionUnlocked} className="hover:opacity-70 disabled:opacity-40 disabled:pointer-events-none"><X size={10} /></button>
                    </span>
                  ))}
                  <Input placeholder="Nova tag" value={newTagLabel} onChange={setNewTagLabel} className="w-28" />
                  <div className="flex gap-1">
                    {PATIENT_TAG_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewTagColor(color)}
                        className={`w-4 h-4 rounded-full border-2 ${PATIENT_TAG_COLOR_CLASSES[color]} ${newTagColor === color ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                      />
                    ))}
                  </div>
                  <Btn variant="ghost" size="sm" disabled={!newTagLabel.trim() || savingTag || !subscriptionUnlocked} onClick={handleAddTag}>
                    <Plus size={12} />Tag
                  </Btn>
                </div>

                <div className="flex gap-1 border-t border-border pt-3">
                  {(["cadastro", "historico", "notas", "escalas", "diario", "materiais"] as const).map(t => (
                    <button key={t} onClick={() => setEhrTab(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${ehrTab === t ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                      {t === "cadastro" ? "Cadastro" : t === "historico" ? "Histórico" : t === "notas" ? "Notas Seguras" : t === "escalas" ? "Escalas" : t === "diario" ? "Diário de Bordo" : "Biblioteca"}
                    </button>
                  ))}
                </div>
              </Card>

              {ehrTab === "cadastro" && (
                <div className="space-y-4">
                  {loadingPatientProfile ? (
                    <Card className="p-6"><p className="text-sm text-muted-foreground">Carregando ficha cadastral...</p></Card>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3 -mt-2">
                        <p className="text-xs text-muted-foreground">
                          Preenchido pelo próprio paciente em Configurações — só leitura aqui.
                        </p>
                        <Btn variant="outline" size="sm" onClick={() => { setUpdateLinkEmail(""); setUpdateLinkMessage(""); setShowUpdateLinkModal(true); }}>
                          <Link2 size={13} />Enviar link de atualização
                        </Btn>
                      </div>

                      <Card className="p-5 space-y-4">
                        <h3 className="font-semibold text-foreground font-display flex items-center gap-2"><User size={16} />Dados Pessoais</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <ReadOnlyField label="Data de nascimento" value={profileForm.birthDate} />
                          <ReadOnlyField label="CPF" value={profileForm.cpf} />
                        </div>
                      </Card>

                      <Card className="p-5 space-y-4">
                        <h3 className="font-semibold text-foreground font-display flex items-center gap-2"><MapPin size={16} />Contatos e Endereço</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <ReadOnlyField label="Logradouro" value={profileForm.addressStreet} />
                          <ReadOnlyField label="Número" value={profileForm.addressNumber} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <ReadOnlyField label="Complemento" value={profileForm.addressComplement} />
                          <ReadOnlyField label="Bairro" value={profileForm.addressNeighborhood} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <ReadOnlyField label="Cidade" value={profileForm.addressCity} />
                          <ReadOnlyField label="Estado (UF)" value={profileForm.addressState} />
                        </div>
                        <ReadOnlyField label="CEP" value={profileForm.addressZip} className="max-w-xs" />
                      </Card>

                      <Card className="p-5 space-y-4">
                        <h3 className="font-semibold text-foreground font-display flex items-center gap-2">
                          <Shield size={16} />Responsável Legal <span className="text-xs font-normal text-muted-foreground">(se necessário)</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <ReadOnlyField label="Nome" value={profileForm.legalGuardianName} />
                          <ReadOnlyField label="CPF" value={profileForm.legalGuardianCpf} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <ReadOnlyField label="Telefone" value={profileForm.legalGuardianPhone} />
                          <ReadOnlyField label="Parentesco" value={profileForm.legalGuardianRelationship} />
                        </div>
                      </Card>

                      <Card className="p-5 space-y-4">
                        <h3 className="font-semibold text-foreground font-display flex items-center gap-2">
                          <CreditCard size={16} />Convênio <span className="text-xs font-normal text-muted-foreground">(se houver)</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <ReadOnlyField label="Convênio" value={profileForm.insuranceProvider} />
                          <ReadOnlyField label="Plano" value={profileForm.insurancePlan} />
                        </div>
                        <ReadOnlyField label="Número da carteirinha" value={profileForm.insuranceCardNumber} className="max-w-xs" />
                      </Card>

                      <Card className="p-5 space-y-4">
                        <h3 className="font-semibold text-foreground font-display flex items-center gap-2"><Heart size={16} />Contato de Emergência</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <ReadOnlyField label="Nome" value={profileForm.emergencyContactName} />
                          <ReadOnlyField label="Telefone" value={profileForm.emergencyContactPhone} />
                        </div>
                        <ReadOnlyField label="Parentesco" value={profileForm.emergencyContactRelationship} className="max-w-xs" />
                      </Card>

                      <Card className="p-5 space-y-2">
                        <h3 className="font-semibold text-foreground font-display flex items-center gap-2"><Clipboard size={16} />Histórico</h3>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{profileForm.clinicalHistory.trim() || "—"}</p>
                      </Card>

                      <Card className="p-5">
                        <h3 className="font-semibold text-foreground font-display mb-3 flex items-center gap-2"><DollarSign size={16} />Financeiro do paciente</h3>
                        {loadingPatientFinancials && <p className="text-sm text-muted-foreground">Carregando...</p>}
                        {!loadingPatientFinancials && patientFinancials.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma consulta registrada ainda.</p>}
                        <div className="divide-y divide-border">
                          {patientFinancials.map(f => {
                            const badge = PAYMENT_STATUS_BADGE[f.paymentStatus];
                            return (
                              <div key={f.appointmentId} className="py-2.5 flex items-center justify-between gap-3">
                                <p className="text-sm text-foreground">
                                  {new Date(f.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                                  <span className="text-muted-foreground"> · R${f.price.toFixed(2).replace(".", ",")}</span>
                                </p>
                                <Badge variant={badge.variant}>{badge.label}</Badge>
                              </div>
                            );
                          })}
                        </div>
                        {patientFinancials.length > 0 && (
                          <div className="flex justify-between text-sm font-medium text-foreground border-t border-border mt-2 pt-2">
                            <span>Total pago</span>
                            <span>R${patientFinancials.filter(f => f.paymentStatus === "paid").reduce((sum, f) => sum + f.price, 0).toFixed(2).replace(".", ",")}</span>
                          </div>
                        )}
                      </Card>

                      <Card className="p-5">
                        <h3 className="font-semibold text-foreground font-display mb-3 flex items-center gap-2"><FileText size={16} />Anexos de documentos</h3>
                        <label className="cursor-pointer">
                          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-border hover:bg-muted ${uploadingPatientDoc ? "opacity-50 pointer-events-none" : ""}`}>
                            <Upload size={14} />{uploadingPatientDoc ? "Enviando..." : "Enviar arquivo"}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingPatientDoc}
                            onChange={e => { const file = e.target.files?.[0]; if (file) void handleUploadPatientDocument(file); e.target.value = ""; }}
                          />
                        </label>
                        {patientDocError && <p className="text-xs text-red-600 mt-2">{patientDocError}</p>}
                        <div className="divide-y divide-border mt-3">
                          {loadingPatientDocs && <p className="text-sm text-muted-foreground">Carregando...</p>}
                          {!loadingPatientDocs && patientDocs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento anexado ainda.</p>}
                          {patientDocs.map(doc => (
                            <div key={doc.id} className="py-2.5 flex items-center justify-between gap-3">
                              <button type="button" onClick={() => handleViewPatientDocument(doc.storagePath)} className="text-left text-sm text-foreground hover:text-primary flex items-center gap-2">
                                <FileText size={14} className="flex-shrink-0" />{doc.fileName}
                              </button>
                              <button type="button" onClick={() => handleDeletePatientDocument(doc)} className="text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                            </div>
                          ))}
                        </div>
                      </Card>

                      <Card className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-foreground font-display flex items-center gap-2"><BookOpen size={16} />Documentos gerados</h3>
                          <Btn variant="outline" size="sm" onClick={openGenerateModal} disabled={templates.length === 0}>
                            <Plus size={13} />Gerar documento
                          </Btn>
                        </div>
                        {documentActionError && <p className="text-xs text-red-600 mb-2">{documentActionError}</p>}
                        <div className="divide-y divide-border">
                          {loadingGeneratedDocs && <p className="text-sm text-muted-foreground">Carregando...</p>}
                          {!loadingGeneratedDocs && generatedDocs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento gerado ainda.</p>}
                          {generatedDocs.map(doc => (
                            <div key={doc.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                              <button type="button" onClick={() => handleViewGeneratedDocument(doc.storagePath)} className="text-left text-sm text-foreground hover:text-primary flex items-center gap-2">
                                <FileText size={14} className="flex-shrink-0" />
                                <span>
                                  {doc.documentType === "recibo" ? "Recibo" : DOCUMENT_TEMPLATE_LABELS[doc.documentType as DocumentTemplateType] ?? doc.documentType}
                                  <span className="text-muted-foreground"> · {new Date(doc.createdAt).toLocaleDateString("pt-BR")}</span>
                                </span>
                              </button>
                              <div className="flex items-center gap-2">
                                {doc.signedAt && <Badge variant="success">Assinado</Badge>}
                                {doc.sentToPatientAt ? (
                                  <Badge variant="outline">Enviado ao paciente</Badge>
                                ) : (
                                  <Btn variant="ghost" size="sm" disabled={sendingDocId === doc.id} onClick={() => handleSendGeneratedDocument(doc)}>
                                    <Send size={13} />{sendingDocId === doc.id ? "Enviando..." : "Enviar ao paciente"}
                                  </Btn>
                                )}
                                <Btn variant="ghost" size="sm" disabled={printingDocId === doc.id} onClick={() => handlePrintGeneratedDocument(doc)}>
                                  <Printer size={13} />{printingDocId === doc.id ? "Preparando..." : "Imprimir"}
                                </Btn>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </>
                  )}
                </div>
              )}

              {showGenerateModal && (
                <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowGenerateModal(false)}>
                  <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    <div className="flex items-start justify-between mb-4">
                      <h2 className="text-lg font-bold text-foreground font-display">Gerar documento</h2>
                      <button type="button" onClick={() => setShowGenerateModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
                    </div>
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">Tipo de documento</label>
                        <select
                          value={generateType}
                          onChange={e => handleChangeGenerateType(e.target.value as DocumentTemplateType)}
                          className="px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {DOCUMENT_TEMPLATE_TYPES.map(type => (
                            <option key={type} value={type}>{DOCUMENT_TEMPLATE_LABELS[type]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-foreground">Conteúdo (revise antes de exportar)</label>
                          <Btn variant="ghost" size="sm" disabled={!generatePreview.trim() || improvingGenerateText || !subscriptionUnlocked} onClick={handleImproveGenerateText}>
                            <Brain size={12} />{improvingGenerateText ? "Melhorando..." : "Melhorar com IA"}
                          </Btn>
                        </div>
                        <textarea
                          value={generatePreview}
                          onChange={e => setGeneratePreview(e.target.value)}
                          className="w-full h-64 p-3 bg-input-background border border-border rounded-xl text-sm text-foreground font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <Input label="Nome completo (assinatura)" placeholder={currentUser.fullName} value={generateTypedName} onChange={setGenerateTypedName} />
                      {generateError && <p className="text-xs text-red-600">{generateError}</p>}
                      <div className="flex justify-end gap-2">
                        <Btn variant="ghost" size="sm" onClick={() => setShowGenerateModal(false)}>Cancelar</Btn>
                        <Btn variant="primary" size="sm" disabled={!generateTypedName.trim() || generating || !subscriptionUnlocked} onClick={handleGenerateDocument}>
                          {generating ? "Gerando..." : "Assinar e exportar PDF"}
                        </Btn>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {ehrTab === "materiais" && (
                <div className="space-y-4">
                  <Card className="p-5">
                    <h3 className="font-semibold text-foreground font-display mb-3">Compartilhar material</h3>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <input type="checkbox" checked={shareWithAll} onChange={e => setShareWithAll(e.target.checked)} />
                      Compartilhar com todos os meus pacientes (em vez de só {selectedPatient?.name ?? "o paciente selecionado"})
                    </label>
                    <label className="cursor-pointer">
                      <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-border hover:bg-muted ${uploadingMaterial || !subscriptionUnlocked ? "opacity-50 pointer-events-none" : ""}`}>
                        <Upload size={14} />{uploadingMaterial ? "Enviando..." : "Enviar arquivo"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingMaterial || !subscriptionUnlocked}
                        onChange={e => { const file = e.target.files?.[0]; if (file) void handleUploadMaterial(file); e.target.value = ""; }}
                      />
                    </label>
                    {materialError && <p className="text-xs text-red-600 mt-2">{materialError}</p>}
                  </Card>

                  <Card className="p-5">
                    <h3 className="font-semibold text-foreground font-display mb-3">Materiais compartilhados</h3>
                    {loadingMaterials && <p className="text-sm text-muted-foreground">Carregando...</p>}
                    {!loadingMaterials && materials.length === 0 && <p className="text-sm text-muted-foreground">Nenhum material enviado ainda.</p>}
                    <div className="divide-y divide-border">
                      {materials.map(m => (
                        <div key={m.id} className="py-2.5 flex items-center justify-between gap-3">
                          <button type="button" onClick={() => handleViewMaterial(m.storagePath)} className="text-left text-sm text-foreground hover:text-primary flex items-center gap-2">
                            <FileText size={14} className="flex-shrink-0" />{m.fileName}
                          </button>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{m.patientId ? patients.find(p => p.id === m.patientId)?.name ?? "1 paciente" : "Todos os pacientes"}</Badge>
                            <button type="button" onClick={() => handleDeleteMaterial(m)} disabled={!subscriptionUnlocked} className="text-muted-foreground hover:text-red-600 disabled:opacity-40 disabled:pointer-events-none"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-5">
                    <h3 className="font-semibold text-foreground font-display mb-3">Atribuir tarefa a {selectedPatient?.name ?? "paciente"}</h3>
                    <div className="space-y-3">
                      <Input label="Título" placeholder="Ex: Diário de pensamentos automáticos" value={taskTitle} onChange={setTaskTitle} />
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">Descrição (opcional)</label>
                        <textarea
                          value={taskDescription}
                          onChange={e => setTaskDescription(e.target.value)}
                          className="w-full h-20 p-3 bg-input-background border border-border rounded-xl text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <Input label="Prazo (opcional)" type="date" value={taskDueDate} onChange={setTaskDueDate} />
                      <Btn variant="primary" disabled={!taskTitle.trim() || assigningTask || !subscriptionUnlocked} onClick={handleAssignTask}>
                        {assigningTask ? "Atribuindo..." : "Atribuir tarefa"}
                      </Btn>
                    </div>
                  </Card>

                  <Card className="p-5">
                    <h3 className="font-semibold text-foreground font-display mb-3">Tarefas atribuídas</h3>
                    {tasks.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa atribuída ainda.</p>}
                    <div className="divide-y divide-border">
                      {tasks.map(t => (
                        <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.title}</p>
                            <p className="text-xs text-muted-foreground">{patients.find(p => p.id === t.patientId)?.name ?? "Paciente"}{t.dueDate ? ` · prazo ${new Date(t.dueDate).toLocaleDateString("pt-BR")}` : ""}</p>
                          </div>
                          <Badge variant={t.completedAt ? "success" : "outline"}>{t.completedAt ? "Concluída" : "Pendente"}</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {ehrTab === "escalas" && (
                <div className="space-y-4">
                  <Card className="p-6">
                    <h3 className="font-semibold text-foreground font-display mb-1">Escalas psicológicas</h3>
                    <p className="text-xs text-muted-foreground mb-4">Pontuações que {selectedPatient?.name ?? "o paciente"} preencheu, na ordem em que foram respondidas.</p>
                    {loadingAssessmentsForPatient && <p className="text-sm text-muted-foreground">Carregando...</p>}
                    {!loadingAssessmentsForPatient && assessments.length === 0 && (
                      <p className="text-sm text-muted-foreground">Este paciente ainda não respondeu nenhuma escala.</p>
                    )}
                    {!loadingAssessmentsForPatient && assessments.length > 0 && (
                      <>
                        <div className="h-52 mb-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={assessments.map(a => ({
                              label: new Date(a.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
                              score: a.totalScore,
                              templateName: a.templateName,
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#EEF6F1" />
                              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E8F5EE", fontSize: 12 }} formatter={(value: number, _name, item: any) => [`${value} pontos`, item.payload.templateName]} />
                              <Bar dataKey="score" fill="#1B7A48" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="divide-y divide-border">
                          {assessments.slice().reverse().map(a => (
                            <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{a.templateName}</p>
                                <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-foreground">{a.totalScore} pontos</p>
                                <p className="text-xs text-muted-foreground">{a.severity}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-foreground font-display">Meus modelos de escala</h3>
                      <Btn variant="outline" size="sm" onClick={openNewTemplateModal}><Plus size={14} />Criar modelo</Btn>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">PHQ-9 e GAD-7 vêm prontos; crie os seus próprios instrumentos com perguntas e faixas de severidade personalizadas.</p>
                    {loadingTemplates && <p className="text-sm text-muted-foreground">Carregando...</p>}
                    <div className="divide-y divide-border">
                      {myTemplates.map(t => (
                        <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.questions.length} pergunta{t.questions.length !== 1 ? "s" : ""}{t.professionalId === null ? " · modelo padrão" : ""}</p>
                          </div>
                          {t.professionalId !== null && (
                            <div className="flex items-center gap-2">
                              <Btn variant="ghost" size="sm" onClick={() => openEditTemplateModal(t)}><Edit3 size={13} /></Btn>
                              <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplate(t.id)}><Trash2 size={13} /></Btn>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {ehrTab === "diario" && (
                <div className="space-y-4">
                  <Card className="p-6">
                    <h3 className="font-semibold text-foreground font-display mb-1">Evolução das escalas</h3>
                    <p className="text-xs text-muted-foreground mb-4">Pontuação de cada instrumento respondido ao longo do tempo.</p>
                    {scoreChartData.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma escala respondida ainda.</p>
                    ) : (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={scoreChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#EEF6F1" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E8F5EE", fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {assessmentTemplateNames.map((name, i) => (
                              <Line key={name} type="monotone" dataKey={name} stroke={DIARY_LINE_COLORS[i % DIARY_LINE_COLORS.length]} strokeWidth={2} connectNulls dot={{ r: 3 }} />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </Card>

                  <Card className="p-6">
                    <h3 className="font-semibold text-foreground font-display mb-4">Linha do tempo</h3>
                    {diaryEntries.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>}
                    <div className="space-y-3">
                      {diaryEntries.map(entry => (
                        <div key={`${entry.type}-${entry.id}`} className="flex gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${entry.type === "session" ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700"}`}>
                            {entry.type === "session" ? <FileText size={14} /> : <BarChart2 size={14} />}
                          </div>
                          <div className="flex-1 min-w-0 pb-3 border-b border-border/50">
                            <p className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</p>
                            {entry.type === "session" ? (
                              <p className="text-sm text-foreground">
                                {entry.excerpt ? (entry.excerpt.length > 160 ? `${entry.excerpt.slice(0, 160)}…` : entry.excerpt) : "Sem conteúdo registrado."}
                                {entry.signedAt && <span className="text-emerald-600"> (assinada)</span>}
                              </p>
                            ) : (
                              <p className="text-sm text-foreground">{entry.templateName}: <span className="font-medium">{entry.totalScore} pontos</span> — {entry.severity}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

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
                        <Badge variant={s.status === "completed" ? "success" : s.status === "cancelled" ? "danger" : s.status === "no_show" ? "warning" : "outline"}>
                          {s.status === "completed" ? "Concluída" : s.status === "cancelled" ? "Cancelada" : s.status === "no_show" ? "Faltou" : "Agendada"}
                        </Badge>
                      </div>
                      {s.subjective || s.objective || s.assessment || s.plan ? (
                        <div className="space-y-1.5 text-sm text-muted-foreground leading-relaxed">
                          {s.subjective && <p><span className="font-medium text-foreground">S: </span>{tiptapJsonToPlainText(s.subjective)}</p>}
                          {s.objective && <p><span className="font-medium text-foreground">O: </span>{tiptapJsonToPlainText(s.objective)}</p>}
                          {s.assessment && <p><span className="font-medium text-foreground">A: </span>{tiptapJsonToPlainText(s.assessment)}</p>}
                          {s.plan && <p><span className="font-medium text-foreground">P: </span>{tiptapJsonToPlainText(s.plan)}</p>}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground leading-relaxed">{s.notes || "Nenhuma nota clínica registrada para esta sessão ainda."}</p>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <Btn variant="ghost" size="sm" onClick={() => { selectSession(s.id); setEhrTab("notas"); }}><Edit3 size={13} />{s.signedAt ? "Ver nota" : "Editar nota"}</Btn>
                        {s.signedAt ? (
                          <Badge variant="success">Assinado por {s.typedName} em {new Date(s.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Badge>
                        ) : (
                          <Badge variant="warning">Não assinado</Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {ehrTab === "notas" && (
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Lock size={16} className="text-amber-600" />
                    <h3 className="font-semibold text-foreground font-display">Notas Seguras (SOAP)</h3>
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
                            {new Date(s.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}{s.signedAt ? " (assinada)" : ""}
                          </option>
                        ))}
                      </select>

                      {selectedSession?.signedAt && (
                        <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                          <Lock size={13} />
                          Assinada digitalmente por {selectedSession.typedName} em {new Date(selectedSession.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} — conteúdo não pode mais ser alterado.
                        </div>
                      )}

                      <input ref={ocrFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleOcrFileChange} />

                      <div className="space-y-3">
                        {(["subjective", "objective", "assessment", "plan"] as const).map(field => {
                          const labels = { subjective: "Subjetivo", objective: "Objetivo", assessment: "Avaliação", plan: "Plano" } as const;
                          const drafts = { subjective: subjectiveDraft, objective: objectiveDraft, assessment: assessmentDraft, plan: planDraft } as const;
                          const isEmpty = !tiptapJsonToPlainText(drafts[field]).trim();
                          return (
                            <div key={field} className="flex flex-col gap-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">{labels[field]}</label>
                                {!selectedSession?.signedAt && (
                                  <div className="flex items-center gap-1">
                                    <Btn variant="ghost" size="sm" disabled={transcribingField === field || !subscriptionUnlocked} onClick={() => openOcrPicker(field)}>
                                      <ScanText size={12} />{transcribingField === field ? "Transcrevendo..." : "Transcrever foto"}
                                    </Btn>
                                    <Btn variant="ghost" size="sm" disabled={isEmpty || improvingField === field || !subscriptionUnlocked} onClick={() => handleImproveSoapField(field, drafts[field])}>
                                      <Brain size={12} />{improvingField === field ? "Melhorando..." : "Melhorar com IA"}
                                    </Btn>
                                  </div>
                                )}
                              </div>
                              <RichTextEditor
                                content={drafts[field]}
                                onChange={SOAP_FIELD_SETTERS[field]}
                                disabled={Boolean(selectedSession?.signedAt) || !subscriptionUnlocked}
                                onImageUpload={selectedPatientId ? () => handleEditorImageUpload(selectedPatientId) : undefined}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {selectedSession?.aiSummary && (
                        <div className="mt-3 p-3 bg-secondary rounded-xl text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Resumo de IA: </span>{selectedSession.aiSummary}
                        </div>
                      )}
                      {saveMessage && <p className={`text-xs mt-2 ${saveMessage.toLowerCase().includes("não foi") ? "text-red-600" : "text-emerald-600"}`}>{saveMessage}</p>}
                      {!selectedSession?.signedAt && (
                        <div className="flex justify-end gap-2 mt-3">
                          <Btn variant="ghost" size="sm" onClick={handleSaveNotes} disabled={saving || !subscriptionUnlocked}><Lock size={13} />{saving ? "Salvando..." : "Salvar com segurança"}</Btn>
                          <Btn
                            variant="primary"
                            size="sm"
                            disabled={[subjectiveDraft, objectiveDraft, assessmentDraft, planDraft].every(d => !tiptapJsonToPlainText(d).trim()) || !subscriptionUnlocked}
                            onClick={() => setShowSignModal(true)}
                          >
                            <Edit3 size={13} />Assinar digitalmente
                          </Btn>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              )}

              {ehrTab === "notas" && selectedPatientId && (
                <Card className="p-6 mt-4">
                  <h3 className="font-semibold text-foreground font-display mb-1 flex items-center gap-2"><Sparkles size={16} />Planejar sessão com IA</h3>
                  <p className="text-xs text-muted-foreground mb-3">Sugestões de pauta pra próxima sessão, a partir do histórico de notas e escalas deste paciente.</p>
                  {!sessionPlan ? (
                    <>
                      <label className="flex items-start gap-2 text-xs text-muted-foreground mb-3">
                        <input type="checkbox" checked={sessionPlanConsent} onChange={e => setSessionPlanConsent(e.target.checked)} className="mt-0.5" />
                        Autorizo o envio do histórico de notas e escalas deste paciente (várias sessões, não só uma) para o Google (Gemini, IA) gerar sugestões de pauta.
                      </label>
                      <Btn variant="outline" size="sm" disabled={!sessionPlanConsent || planningSession || !subscriptionUnlocked} onClick={handlePlanSession}>
                        <Sparkles size={14} />{planningSession ? "Gerando..." : "Planejar sessão com IA"}
                      </Btn>
                      {sessionPlanError && <p className="text-xs text-amber-700 mt-2">{sessionPlanError}</p>}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <ul className="list-disc pl-5 text-sm text-foreground space-y-1">
                        {sessionPlan.topics.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                      {sessionPlan.notes && <p className="text-xs text-muted-foreground p-3 bg-secondary rounded-xl">{sessionPlan.notes}</p>}
                      <Btn variant="ghost" size="sm" onClick={() => setSessionPlan(null)}>Gerar novamente</Btn>
                    </div>
                  )}
                </Card>
              )}

              {showSignModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                  <Card className="p-6 max-w-md w-full space-y-4">
                    <h3 className="font-semibold text-foreground font-display">Assinatura digital da nota clínica</h3>
                    <p className="text-xs text-muted-foreground">
                      Ao assinar, esta nota SOAP fica permanentemente registrada em seu nome e não poderá mais ser editada. Digite seu nome completo para confirmar.
                    </p>
                    <Input label="Nome completo" placeholder={currentUser.fullName} value={signTypedName} onChange={setSignTypedName} />
                    <div className="flex justify-end gap-2">
                      <Btn variant="ghost" size="sm" onClick={() => { setShowSignModal(false); setSignTypedName(""); }}>Cancelar</Btn>
                      <Btn variant="primary" size="sm" disabled={!signTypedName.trim() || signing || !subscriptionUnlocked} onClick={handleSignNote}>
                        {signing ? "Assinando..." : "Confirmar assinatura"}
                      </Btn>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showUpdateLinkModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowUpdateLinkModal(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">Enviar link de atualização</h2>
              <button type="button" onClick={() => setShowUpdateLinkModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              O paciente recebe um e-mail com um link que já abre direto na ficha cadastral dele, autenticado — sem precisar digitar senha.
            </p>
            <div className="space-y-3">
              <Input label="E-mail do paciente" type="email" value={updateLinkEmail} onChange={setUpdateLinkEmail} />
              {updateLinkMessage && (
                <div className={`rounded-xl border px-3 py-2 text-sm ${updateLinkMessage.startsWith("Não") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  {updateLinkMessage}
                </div>
              )}
              <Btn variant="primary" className="w-full justify-center" onClick={handleSendUpdateLink} disabled={sendingUpdateLink || !subscriptionUnlocked}>
                {sendingUpdateLink ? "Enviando..." : "Enviar link"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">{editingTemplateId ? "Editar modelo" : "Criar modelo"}</h2>
              <button type="button" onClick={() => setShowTemplateModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <Input label="Nome do modelo" placeholder="Ex.: Escala de qualidade do sono" value={templateName} onChange={setTemplateName} />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Perguntas</label>
                {templateQuestions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={q}
                      onChange={e => setTemplateQuestions(prev => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                      placeholder={`Pergunta ${i + 1}`}
                      className="flex-1 px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {templateQuestions.length > 1 && (
                      <button type="button" onClick={() => setTemplateQuestions(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-red-600"><X size={16} /></button>
                    )}
                  </div>
                ))}
                <Btn variant="ghost" size="sm" onClick={() => setTemplateQuestions(prev => [...prev, ""])} className="self-start"><Plus size={13} />Adicionar pergunta</Btn>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Faixas de severidade</label>
                <p className="text-xs text-muted-foreground -mt-1">Cada resposta vale de 0 a 3 pontos. A última faixa não precisa de "até pontuação" — ela cobre tudo acima da faixa anterior.</p>
                {templateBands.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i < templateBands.length - 1 ? (
                      <input
                        type="number"
                        value={b.max}
                        onChange={e => setTemplateBands(prev => prev.map((v, idx) => (idx === i ? { ...v, max: e.target.value } : v)))}
                        placeholder="Até pontuação"
                        className="w-32 px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    ) : (
                      <span className="w-32 text-xs text-muted-foreground">Acima disso</span>
                    )}
                    <input
                      value={b.label}
                      onChange={e => setTemplateBands(prev => prev.map((v, idx) => (idx === i ? { ...v, label: e.target.value } : v)))}
                      placeholder="Rótulo (ex.: Leve)"
                      className="flex-1 px-3 py-2.5 bg-input-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {templateBands.length > 1 && (
                      <button type="button" onClick={() => setTemplateBands(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-red-600"><X size={16} /></button>
                    )}
                  </div>
                ))}
                <Btn variant="ghost" size="sm" onClick={() => setTemplateBands(prev => [...prev, { max: "", label: "" }])} className="self-start"><Plus size={13} />Adicionar faixa</Btn>
              </div>

              {templateError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{templateError}</div>}
              <Btn variant="primary" className="w-full justify-center" onClick={handleSaveTemplate} disabled={savingTemplate || !subscriptionUnlocked}>
                {savingTemplate ? "Salvando..." : "Salvar modelo"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── SCREEN: AI Assistant ─────────────────────────────────────────────────────

function AIAssistantScreen({ onNavigate, currentUser, onSignOut, subscriptionUnlocked }: AuthenticatedScreenProps & { subscriptionUnlocked: boolean }) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("patients") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <BookOpen size={18} />, label: "Biblioteca", onClick: () => onNavigate("library") },
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
    <AppShell title="IA Assistente Clínico" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
      {!subscriptionUnlocked && <SubscriptionLockedBanner onNavigate={onNavigate} />}
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
                disabled={!aiConsent || !notesDraft.trim() || aiLoading || !selectedSessionId || !subscriptionUnlocked}
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
                  <Btn variant="outline" size="sm" className="w-full justify-center" onClick={handleUseSuggestedNote} disabled={!subscriptionUnlocked}>
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
                <Btn variant="primary" className="flex-1 justify-center" disabled={!selectedSessionId || saving || !subscriptionUnlocked} onClick={handleSaveNotes}>
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
  const [mockReason, setMockReason] = useState("");

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
      const liveKitResult = await getLiveKitRoomAccess(appointmentId);
      if (!active) return;
      if (liveKitResult.ok) {
        setLiveKitAccess(liveKitResult.access);
      } else {
        setMockReason(liveKitResult.reason);
      }

      let { data: room } = await supabase
        .from("video_rooms")
        .select("room_url")
        .eq("appointment_id", appointmentId)
        .maybeSingle();

      if (!room && !liveKitResult.ok) {
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
      {mockReason && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs px-6 py-2">
          Sala de demonstração (não é a videochamada real): {mockReason}
        </div>
      )}
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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [checkoutError, setCheckoutError] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState(currentUser.email);
  const [phone, setPhone] = useState("");

  const [checkingConsent, setCheckingConsent] = useState(true);
  const [alreadySignedAt, setAlreadySignedAt] = useState<string | null>(null);
  const [typedConsentName, setTypedConsentName] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [signingConsent, setSigningConsent] = useState(false);
  const [consentError, setConsentError] = useState("");

  const [passFeeToPatient, setPassFeeToPatient] = useState(false);

  useEffect(() => {
    if (!bookingDraft) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("professional_profiles").select("pass_fee_to_patient").eq("id", bookingDraft.professionalId).maybeSingle();
      if (active) setPassFeeToPatient(Boolean(data?.pass_fee_to_patient));
    })();
    return () => {
      active = false;
    };
  }, [bookingDraft?.professionalId]);

  const platformFeeAmount = passFeeToPatient && bookingDraft ? Number((bookingDraft.price * 0.1).toFixed(2)) : 0;
  const totalWithFee = bookingDraft ? bookingDraft.price + platformFeeAmount : 0;

  useEffect(() => {
    if (!bookingDraft) return;
    let active = true;
    setCheckingConsent(true);
    (async () => {
      const { data } = await supabase
        .from("consent_signatures")
        .select("signed_at")
        .eq("patient_id", currentUser.id)
        .eq("professional_id", bookingDraft.professionalId)
        .eq("document_version", CURRENT_CONSENT_VERSION)
        .maybeSingle();
      if (active) {
        setAlreadySignedAt(data?.signed_at ?? null);
        setCheckingConsent(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [bookingDraft?.professionalId, currentUser.id]);

  const handleSignConsent = async () => {
    if (!bookingDraft) return;
    if (!consentAccepted || !typedConsentName.trim()) {
      setConsentError("Marque o consentimento e digite seu nome completo para continuar.");
      return;
    }
    setSigningConsent(true);
    setConsentError("");
    try {
      const documentText = informedConsent.sections.map(s => `${s.heading}\n${s.body}`).join("\n\n");
      const hash = await hashDocumentText(documentText);
      const ok = await signConsent(bookingDraft.professionalId, typedConsentName.trim(), hash, CURRENT_CONSENT_VERSION);
      if (!ok) {
        setConsentError("Não foi possível registrar sua assinatura. Tente novamente.");
        return;
      }
      setStep(3);
    } catch (error) {
      reportError(error, { flow: "checkout.signConsent" });
      setConsentError("Não foi possível registrar sua assinatura. Tente novamente.");
    } finally {
      setSigningConsent(false);
    }
  };

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

      // Best-effort: if this booking fills a slot the patient was waitlisted for, mark that entry
      // claimed so it stops showing as still-waiting. Never blocks the booking itself.
      void supabase
        .from("waitlist_entries")
        .update({ status: "claimed" })
        .eq("patient_id", currentUser.id)
        .eq("professional_id", bookingDraft.professionalId)
        .eq("desired_scheduled_at", bookingDraft.scheduledAt)
        .eq("status", "waiting");

      // Real payment path: redirect to Asaas's hosted checkout. The webhook (not this
      // redirect) is what actually confirms payment — see supabase/functions/asaas-webhook.
      const asaasCheckoutUrl = await createAsaasCheckout(appointment.id);
      if (asaasCheckoutUrl) {
        window.location.href = asaasCheckoutUrl;
        return;
      }

      // Fallback: Asaas isn't configured yet, so simulate an instant successful charge.
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
      void invokeEdgeFunction("send-booking-confirmation", { body: { appointmentId: appointment.id } });

      setStep(4);
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
              {[1, 2, 3, 4].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>{step > s ? <Check size={13} /> : s}</div>
                  {s < 4 && <div className={`h-px w-10 ${step > s ? "bg-primary" : "bg-border"}`} />}
                </div>
              ))}
              <span className="text-xs text-muted-foreground ml-2">{["Dados pessoais", "Consentimento", "Pagamento", "Confirmação"][step - 1]}</span>
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
                <h2 className="font-semibold text-foreground font-display">{informedConsent.title}</h2>
                {checkingConsent ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : alreadySignedAt ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Você já assinou este termo com {bookingDraft.professionalName} em {new Date(alreadySignedAt).toLocaleDateString("pt-BR")}. Não é preciso assinar de novo.
                    </p>
                    <div className="flex gap-3">
                      <Btn variant="outline" onClick={() => setStep(1)}>Voltar</Btn>
                      <Btn variant="primary" className="flex-1 justify-center" onClick={() => setStep(3)}>Continuar <ChevronRight size={16} /></Btn>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="max-h-64 overflow-y-auto space-y-4 pr-1 border border-border rounded-xl p-4 bg-muted/30">
                      {informedConsent.sections.map(s => (
                        <div key={s.heading}>
                          <p className="text-sm font-semibold text-foreground mb-1">{s.heading}</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                        </div>
                      ))}
                    </div>
                    <Input label="Digite seu nome completo para assinar" placeholder={currentUser.fullName} value={typedConsentName} onChange={setTypedConsentName} />
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={consentAccepted} onChange={e => setConsentAccepted(e.target.checked)} className="mt-0.5 accent-primary" />
                      Li e concordo com o Termo de Consentimento Informado acima para o atendimento com {bookingDraft.professionalName}.
                    </label>
                    {consentError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{consentError}</div>
                    )}
                    <div className="flex gap-3">
                      <Btn variant="outline" onClick={() => setStep(1)}>Voltar</Btn>
                      <Btn variant="primary" className="flex-1 justify-center" disabled={signingConsent || !consentAccepted || !typedConsentName.trim()} onClick={handleSignConsent}>
                        {signingConsent ? "Assinando..." : "Assinar e continuar"}
                      </Btn>
                    </div>
                  </>
                )}
              </Card>
            )}

            {step === 3 && (
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
                  <Btn variant="outline" onClick={() => setStep(2)}>Voltar</Btn>
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

            {step === 4 && (
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
                {passFeeToPatient && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxa da plataforma</span><span>R${platformFeeAmount.toFixed(2).replace(".", ",")}</span></div>
                )}
                <div className="flex justify-between font-bold text-foreground border-t border-border pt-2 mt-2"><span>Total</span><span className="font-display">R${totalWithFee.toFixed(2).replace(".", ",")}</span></div>
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

function FinancialDashboard({ onNavigate, currentUser, onSignOut, subscriptionUnlocked }: AuthenticatedScreenProps & { subscriptionUnlocked: boolean }) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("patients") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <BookOpen size={18} />, label: "Biblioteca", onClick: () => onNavigate("library") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", active: true, onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<{ id: string; status: string; patientId: string }[]>([]);
  const [recentPayments, setRecentPayments] = useState<{ amount: number; platformFee: number; createdAt: string }[]>([]);
  const [revenueData, setRevenueData] = useState<{ month: string; bruto: number; liquido: number; liquidoAposDespesas: number }[]>([]);

  const [expenses, setExpenses] = useState<{ id: string; category: string; amount: number; expenseDate: string; notes: string | null }[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [newExpenseDate, setNewExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newExpenseNotes, setNewExpenseNotes] = useState("");
  const [expenseError, setExpenseError] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  const reloadExpenses = async () => {
    setLoadingExpenses(true);
    const { data } = await supabase
      .from("expenses")
      .select("id, category, amount, expense_date, notes")
      .eq("professional_id", currentUser.id)
      .order("expense_date", { ascending: false });
    setExpenses(((data ?? []) as any[]).map(e => ({ id: e.id, category: e.category, amount: Number(e.amount), expenseDate: e.expense_date, notes: e.notes })));
    setLoadingExpenses(false);
  };

  const handleAddExpense = async () => {
    setExpenseError("");
    const amountValue = Number(newExpenseAmount);
    if (!newExpenseCategory.trim() || !newExpenseAmount || Number.isNaN(amountValue) || amountValue <= 0 || !newExpenseDate) {
      setExpenseError("Preencha categoria, valor e data.");
      return;
    }

    setSavingExpense(true);
    const { error } = await supabase.from("expenses").insert({
      professional_id: currentUser.id,
      category: newExpenseCategory.trim(),
      amount: amountValue,
      expense_date: newExpenseDate,
      notes: newExpenseNotes.trim() || null,
    });
    setSavingExpense(false);

    if (error) {
      reportError(error, { flow: "financial.addExpense" });
      setExpenseError("Não foi possível salvar a despesa. Tente novamente.");
      return;
    }

    setNewExpenseCategory("");
    setNewExpenseAmount("");
    setNewExpenseNotes("");
    await reloadExpenses();
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm("Remover esta despesa?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      reportError(error, { flow: "financial.deleteExpense" });
      window.alert("Não foi possível remover a despesa. Tente novamente.");
      return;
    }
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  useEffect(() => {
    void reloadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      const [{ data: apptData }, { data: paymentRows }] = await Promise.all([
        supabase.from("appointments").select("id, status, patient_id").eq("professional_id", currentUser.id),
        supabase
          .from("payments")
          .select("amount, platform_fee, created_at, appointments!inner(professional_id, scheduled_at)")
          .eq("appointments.professional_id", currentUser.id)
          .eq("status", "paid")
          .order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      setAppointments(((apptData ?? []) as any[]).map(a => ({ id: a.id, status: a.status, patientId: a.patient_id })));

      const payments = ((paymentRows ?? []) as any[])
        .filter(p => p.appointments?.scheduled_at)
        .map(p => ({ amount: Number(p.amount), platformFee: Number(p.platform_fee), createdAt: p.appointments.scheduled_at as string }));
      setRecentPayments(payments.slice(0, 8));

      const months = getLastMonths(7);
      const brutoByMonth = bucketAmountsByMonth(payments.map(p => ({ amount: p.amount, dateIso: p.createdAt })), months);
      const liquidoByMonth = bucketAmountsByMonth(payments.map(p => ({ amount: p.amount - p.platformFee, dateIso: p.createdAt })), months);

      const { data: expenseRows } = await supabase.from("expenses").select("amount, expense_date").eq("professional_id", currentUser.id);
      if (!active) return;
      const expensesByMonth = bucketAmountsByMonth(
        ((expenseRows ?? []) as any[]).map(e => ({ amount: Number(e.amount), dateIso: e.expense_date })),
        months
      );

      setRevenueData(months.map((m, i) => ({
        month: m.label,
        bruto: brutoByMonth[i].total,
        liquido: liquidoByMonth[i].total,
        liquidoAposDespesas: liquidoByMonth[i].total - expensesByMonth[i].total,
      })));

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const [sessions, setSessions] = useState<AppointmentWithPaymentStatus[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [professionalLicense, setProfessionalLicense] = useState("");
  const [professionalCpf, setProfessionalCpf] = useState<string | null>(null);
  const [professionalLogoUrl, setProfessionalLogoUrl] = useState<string | null>(null);
  const [busyAppointmentId, setBusyAppointmentId] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState("");
  const [pixModal, setPixModal] = useState<{ qrCode: string; qrCodeBase64: string | null; expiresAt: string | null } | null>(null);
  const [linkModal, setLinkModal] = useState<string | null>(null);
  const [notaFiscalMessages, setNotaFiscalMessages] = useState<Record<string, string>>({});

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      setSessions(await listAppointmentsWithPaymentStatus(currentUser.id));
    } catch (error) {
      reportError(error, { flow: "financial.loadSessions" });
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    void loadSessions();
    (async () => {
      const { data } = await supabase.from("professional_profiles").select("license_type, license_number, cpf, logo_url").eq("id", currentUser.id).maybeSingle();
      if (data) {
        setProfessionalLicense(`${data.license_type} ${data.license_number}`.trim());
        setProfessionalCpf(data.cpf);
        setProfessionalLogoUrl(data.logo_url);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleChargePix = async (appointmentId: string) => {
    setSessionsError("");
    setBusyAppointmentId(appointmentId);
    const result = await createPixCharge(appointmentId);
    setBusyAppointmentId(null);
    if (!result.ok) {
      setSessionsError(result.error);
      return;
    }
    setPixModal(result);
    await loadSessions();
  };

  const handleGenerateLink = async (appointmentId: string) => {
    setSessionsError("");
    setBusyAppointmentId(appointmentId);
    const url = await createAsaasCheckout(appointmentId);
    setBusyAppointmentId(null);
    if (!url) {
      setSessionsError("Asaas não está configurado nesta conta.");
      return;
    }
    setLinkModal(url);
  };

  const handleMarkPaid = async (session: AppointmentWithPaymentStatus) => {
    if (!window.confirm(`Confirma que recebeu R$${session.price.toFixed(2).replace(".", ",")} por essa consulta fora da plataforma (dinheiro, transferência etc.)? Isso marca a consulta como paga e libera a videochamada real.`)) return;
    setSessionsError("");
    setBusyAppointmentId(session.appointmentId);
    const result = await markAppointmentPaid(session.appointmentId);
    setBusyAppointmentId(null);
    if (!result.ok) {
      setSessionsError(result.error);
      return;
    }
    await loadSessions();
  };

  const handleIssueReceipt = async (session: AppointmentWithPaymentStatus) => {
    if (!session.paymentId) return;
    setSessionsError("");
    setBusyAppointmentId(session.appointmentId);
    try {
      const [patientProfile, payment] = await Promise.all([
        getPatientProfile(session.patientId).catch(() => null),
        getPayment(session.paymentId),
      ]);
      const receiptFields = { patientCpf: patientProfile?.cpf ?? null, professionalCpf };
      const missing = missingReceitaSaudeFields(receiptFields);
      const url = await generateReceiptPdf({
        patientId: session.patientId,
        patientName: session.patientName,
        patientCpf: patientProfile?.cpf ?? null,
        professionalId: currentUser.id,
        professionalName: currentUser.fullName,
        professionalLicense: professionalLicense || "CRP",
        professionalCpf,
        professionalLogoUrl,
        appointmentId: session.appointmentId,
        scheduledAt: session.scheduledAt,
        paymentId: session.paymentId,
        amount: payment?.amount ?? session.price,
        method: payment?.method ?? "mock",
        paidAt: payment?.createdAt ?? session.scheduledAt,
      });
      window.open(url, "_blank", "noopener,noreferrer");
      if (missing.length) {
        setSessionsError(`Recibo gerado, mas faltam campos pro Receita Saúde: ${missing.join("; ")}.`);
      }
    } catch (error) {
      reportError(error, { flow: "financial.issueReceipt" });
      setSessionsError("Não foi possível gerar o recibo.");
    } finally {
      setBusyAppointmentId(null);
    }
  };

  const handleRequestNotaFiscal = async (session: AppointmentWithPaymentStatus) => {
    if (!session.paymentId) return;
    setSessionsError("");
    setBusyAppointmentId(session.appointmentId);
    const result = await requestNotaFiscal(session.paymentId);
    setBusyAppointmentId(null);
    setNotaFiscalMessages(prev => ({ ...prev, [session.paymentId!]: result.message }));
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Best-effort: clipboard API can be unavailable (older browsers, non-HTTPS) — the modal
      // still shows the text to copy manually.
    }
  };

  const currentMonthBruto = revenueData[revenueData.length - 1]?.bruto ?? 0;
  const currentMonthLiquido = revenueData[revenueData.length - 1]?.liquido ?? 0;
  const totalBrutoAllTime = recentPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalFeeAllTime = recentPayments.reduce((sum, p) => sum + p.platformFee, 0);

  const attendanceRate = calculateAttendanceRate(appointments);
  const cancellationRate = calculateCancellationRate(appointments);
  const noShowRate = calculateNoShowRate(appointments);
  const retentionRate = calculateRetentionRate(appointments);
  const pastAppointments = appointments.filter(a => a.status === "completed" || a.status === "cancelled" || a.status === "no_show");
  const distinctPatientsCount = new Set(appointments.map(a => a.patientId)).size;

  return (
    <AppShell title="Dashboard Financeiro" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
      <div className="space-y-6">
        {!subscriptionUnlocked && <SubscriptionLockedBanner onNavigate={onNavigate} />}
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Receita bruta (mês atual)" value={`R$${currentMonthBruto.toFixed(2).replace(".", ",")}`} icon={<TrendingUp size={18} />} color="green" />
          <StatCard label="Após comissão (mês atual)" value={`R$${currentMonthLiquido.toFixed(2).replace(".", ",")}`} icon={<DollarSign size={18} />} color="blue" />
          <StatCard label="Recebido (últimos pagamentos)" value={`R$${totalBrutoAllTime.toFixed(2).replace(".", ",")}`} icon={<BarChart2 size={18} />} color="purple" />
          <StatCard label="Comissão da plataforma" value={`R$${totalFeeAllTime.toFixed(2).replace(".", ",")}`} icon={<Clock size={18} />} color="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <StatCard label="Taxa de comparecimento" value={`${(attendanceRate * 100).toFixed(0)}%`} icon={<CheckCircle size={18} />} color="green" />
          <StatCard label="Taxa de cancelamento" value={`${(cancellationRate * 100).toFixed(0)}%`} icon={<X size={18} />} color="amber" />
          <StatCard label="Taxa de falta" value={`${(noShowRate * 100).toFixed(0)}%`} icon={<AlertCircle size={18} />} color="amber" />
          <StatCard label="Retenção de pacientes" value={`${(retentionRate * 100).toFixed(0)}%`} icon={<Heart size={18} />} color="blue" />
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground font-display">Receita bruta vs. líquida</h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-primary" />Bruto</span>
              <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-accent" />Líquido (após comissão)</span>
              <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500" />Líquido após despesas</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1B7A48" stopOpacity={0.15} /><stop offset="95%" stopColor="#1B7A48" stopOpacity={0} /></linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B6FA8" stopOpacity={0.15} /><stop offset="95%" stopColor="#3B6FA8" stopOpacity={0} /></linearGradient>
                <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E8A33D" stopOpacity={0.15} /><stop offset="95%" stopColor="#E8A33D" stopOpacity={0} /></linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#547A65" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF6F1" />
              <Tooltip
                formatter={(v: number, n: string) => [`R$${v.toLocaleString()}`, n === "bruto" ? "Bruto" : n === "liquido" ? "Líquido" : "Líquido após despesas"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #E8F5EE", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="bruto" stroke="#1B7A48" fill="url(#g1)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="liquido" stroke="#3B6FA8" fill="url(#g2)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="liquidoAposDespesas" stroke="#E8A33D" fill="url(#g3)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="font-semibold text-foreground font-display mb-4">Pagamentos recentes</h3>
            {!loading && recentPayments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento recebido ainda.</p>}
            <div className="space-y-3">
              {recentPayments.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{new Date(p.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
                    <p className="text-xs text-muted-foreground">Comissão: R${p.platformFee.toFixed(2).replace(".", ",")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground font-display">R${p.amount.toFixed(2).replace(".", ",")}</p>
                    <Badge variant="success">Pago</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-foreground font-display mb-4">Detalhes das métricas</h3>
            <div className="space-y-3">
              {[
                ["Pacientes distintos", String(distinctPatientsCount)],
                ["Consultas concluídas", String(appointments.filter(a => a.status === "completed").length)],
                ["Consultas canceladas", String(appointments.filter(a => a.status === "cancelled").length)],
                ["Faltas", String(appointments.filter(a => a.status === "no_show").length)],
                ["Base de cálculo (concluídas + canceladas + faltas)", String(pastAppointments.length)],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                  <span className="text-muted-foreground">{l}</span><span className="font-medium text-foreground">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <h3 className="font-semibold text-foreground font-display mb-1">Sessões</h3>
          <p className="text-xs text-muted-foreground mb-4">Cobrança, recibo e nota fiscal por consulta.</p>
          {sessionsError && <p className="text-xs text-red-600 mb-3">{sessionsError}</p>}
          {loadingSessions && <p className="text-sm text-muted-foreground">Carregando sessões...</p>}
          {!loadingSessions && sessions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma consulta ainda.</p>}
          <div className="divide-y divide-border">
            {sessions.map(s => {
              const badge = PAYMENT_STATUS_BADGE[s.paymentStatus];
              const busy = busyAppointmentId === s.appointmentId;
              return (
                <div key={s.appointmentId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })} · R${s.price.toFixed(2).replace(".", ",")}
                    </p>
                    {s.paymentId && notaFiscalMessages[s.paymentId] && (
                      <p className="text-xs text-amber-700 mt-1">{notaFiscalMessages[s.paymentId]}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {(s.paymentStatus === "uncharged" || s.paymentStatus === "pending") && (
                      <>
                        <Btn variant="outline" size="sm" disabled={busy || !subscriptionUnlocked} onClick={() => handleChargePix(s.appointmentId)}>
                          <QrCode size={13} />Cobrar via Pix
                        </Btn>
                        <Btn variant="ghost" size="sm" disabled={busy || !subscriptionUnlocked} onClick={() => handleGenerateLink(s.appointmentId)}>
                          <Link2 size={13} />Gerar link
                        </Btn>
                        <Btn variant="ghost" size="sm" disabled={busy || !subscriptionUnlocked} onClick={() => handleMarkPaid(s)}>
                          <Check size={13} />Marcar como pago
                        </Btn>
                      </>
                    )}
                    {s.paymentStatus === "paid" && (
                      <>
                        <Btn variant="outline" size="sm" disabled={busy || !subscriptionUnlocked} onClick={() => handleIssueReceipt(s)}>
                          <Receipt size={13} />Emitir recibo
                        </Btn>
                        <Btn variant="ghost" size="sm" disabled={busy || !subscriptionUnlocked} onClick={() => handleRequestNotaFiscal(s)}>
                          <FileText size={13} />Nota fiscal
                        </Btn>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-foreground font-display mb-1">Despesas</h3>
          <p className="text-xs text-muted-foreground mb-4">Lance seus custos (aluguel, materiais, assinaturas) para acompanhar o líquido real após despesas.</p>
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <Input label="Categoria" placeholder="Ex.: Aluguel" value={newExpenseCategory} onChange={setNewExpenseCategory} />
            <Input label="Valor (R$)" type="number" value={newExpenseAmount} onChange={setNewExpenseAmount} />
            <Input label="Data" type="date" value={newExpenseDate} onChange={setNewExpenseDate} />
            <Input label="Observações (opcional)" value={newExpenseNotes} onChange={setNewExpenseNotes} />
          </div>
          {expenseError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-3">{expenseError}</div>}
          <Btn variant="outline" size="sm" onClick={handleAddExpense} disabled={savingExpense || !subscriptionUnlocked}><Plus size={14} />{savingExpense ? "Salvando..." : "Lançar despesa"}</Btn>

          {loadingExpenses && <p className="text-sm text-muted-foreground mt-4">Carregando despesas...</p>}
          {!loadingExpenses && expenses.length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhuma despesa lançada ainda.</p>}
          <div className="divide-y divide-border mt-2">
            {expenses.map(e => (
              <div key={e.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{e.category}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(`${e.expenseDate}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="text-sm font-bold text-foreground font-display">R${e.amount.toFixed(2).replace(".", ",")}</p>
                  <button type="button" onClick={() => handleDeleteExpense(e.id)} disabled={!subscriptionUnlocked} className="text-muted-foreground hover:text-red-600 disabled:opacity-40 disabled:pointer-events-none"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {pixModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setPixModal(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">Cobrança via Pix</h2>
              <button type="button" onClick={() => setPixModal(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            {pixModal.qrCodeBase64 && (
              <img src={`data:image/png;base64,${pixModal.qrCodeBase64}`} alt="QR code Pix" className="w-48 h-48 mx-auto mb-4" />
            )}
            <p className="text-xs text-muted-foreground mb-2">Pix copia e cola</p>
            <div className="p-3 bg-secondary rounded-xl text-xs text-foreground break-all mb-3">{pixModal.qrCode}</div>
            {pixModal.expiresAt && (
              <p className="text-xs text-muted-foreground mb-3">Expira em {new Date(pixModal.expiresAt).toLocaleString("pt-BR")}</p>
            )}
            <Btn variant="primary" className="w-full justify-center" onClick={() => copyToClipboard(pixModal.qrCode)}>
              <Copy size={14} />Copiar código
            </Btn>
          </div>
        </div>
      )}

      {linkModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setLinkModal(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground font-display">Link de pagamento</h2>
              <button type="button" onClick={() => setLinkModal(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-3 bg-secondary rounded-xl text-xs text-foreground break-all mb-3">{linkModal}</div>
            <Btn variant="primary" className="w-full justify-center" onClick={() => copyToClipboard(linkModal)}>
              <Copy size={14} />Copiar link
            </Btn>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── SCREEN: Biblioteca de Modelos ────────────────────────────────────────────

/** Real Canva collection pages (confirmed to exist, not guessed query-string URLs — Canva doesn't
 *  publish a documented search-by-query URL format) to pair with post ideas the professional can
 *  adapt. Each opens Canva's own template gallery for that theme; MindCare has no Canva Connect
 *  API integration, this is just a shortcut into Canva's existing public template library. */
const MARKETING_POST_IDEAS: { theme: string; caption: string; canvaUrl: string }[] = [
  { theme: "Saúde mental (geral)", caption: "Um lembrete de que cuidar da saúde mental é tão importante quanto cuidar do corpo.", canvaUrl: "https://www.canva.com/templates/s/mental-health/" },
  { theme: "Psicologia", caption: "Apresente sua abordagem e especialidades pro seu público.", canvaUrl: "https://www.canva.com/templates/s/psychology/" },
  { theme: "Pôster de conscientização", caption: "Um pôster sobre sinais de alerta e quando buscar ajuda.", canvaUrl: "https://www.canva.com/posters/templates/mental-health/" },
  { theme: "Panfleto informativo", caption: "Explique um tema clínico (ansiedade, luto, autoestima) de forma acessível.", canvaUrl: "https://www.canva.com/brochures/templates/mental-health/" },
  { theme: "Flyer de divulgação", caption: "Divulgue sua agenda aberta ou um novo grupo terapêutico.", canvaUrl: "https://www.canva.com/flyers/templates/mental-health/" },
];

function LibraryScreen({ onNavigate, currentUser, onSignOut, subscriptionUnlocked }: AuthenticatedScreenProps & { subscriptionUnlocked: boolean }) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("patients") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <BookOpen size={18} />, label: "Biblioteca", active: true, onClick: () => onNavigate("library") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", onClick: () => onNavigate("professional-settings") },
  ];

  const [libraryTab, setLibraryTab] = useState<"modelos" | "marketing">("modelos");
  const [templates, setTemplates] = useState<EffectiveTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<DocumentTemplateType>("declaracao_comparecimento");
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const loadTemplates = async () => {
    setLoading(true);
    try {
      setTemplates(await listEffectiveTemplates(currentUser.id));
    } catch (error) {
      reportError(error, { flow: "library.loadTemplates" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  useEffect(() => {
    const current = templates.find(t => t.type === selectedType);
    if (current) {
      setTitleDraft(current.title);
      setBodyDraft(current.body);
    }
  }, [selectedType, templates]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");
    try {
      await saveTemplateCustomization(currentUser.id, selectedType, titleDraft, bodyDraft);
      await loadTemplates();
      setSaveMessage("Modelo salvo com sucesso.");
    } catch (error) {
      reportError(error, { flow: "library.saveTemplate" });
      setSaveMessage("Não foi possível salvar o modelo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Biblioteca de Modelos" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
      {!subscriptionUnlocked && <SubscriptionLockedBanner onNavigate={onNavigate} />}
      <div className="flex gap-1 mb-4 border-b border-border">
        <button onClick={() => setLibraryTab("modelos")} className={`px-3 py-2 text-sm font-medium transition-all ${libraryTab === "modelos" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
          Modelos de documentos
        </button>
        <button onClick={() => setLibraryTab("marketing")} className={`px-3 py-2 text-sm font-medium transition-all ${libraryTab === "marketing" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
          Marketing
        </button>
      </div>

      {libraryTab === "marketing" ? (
        <div className="grid md:grid-cols-2 gap-4">
          {MARKETING_POST_IDEAS.map(idea => (
            <Card key={idea.theme} className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground font-display">{idea.theme}</h3>
              <p className="text-sm text-muted-foreground">{idea.caption}</p>
              <a href={idea.canvaUrl} target="_blank" rel="noopener noreferrer">
                <Btn variant="outline" size="sm">Criar no Canva</Btn>
              </a>
            </Card>
          ))}
        </div>
      ) : (
      <div className="flex gap-6 h-full">
        <div className="w-64 flex-shrink-0 space-y-2">
          {DOCUMENT_TEMPLATE_TYPES.map(type => {
            const t = templates.find(x => x.type === type);
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`w-full flex items-center justify-between gap-2 p-3 rounded-xl text-left transition-all ${selectedType === type ? "bg-secondary border border-border" : "hover:bg-muted"}`}
              >
                <span className="text-sm font-medium text-foreground">{DOCUMENT_TEMPLATE_LABELS[type]}</span>
                {t?.isCustomized && <Badge variant="accent">Personalizado</Badge>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 space-y-4">
          {loading ? (
            <Card className="p-6"><p className="text-sm text-muted-foreground">Carregando modelos...</p></Card>
          ) : (
            <>
              <Card className="p-5 space-y-4">
                <Input label="Título" value={titleDraft} onChange={setTitleDraft} />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Texto do modelo</label>
                  <textarea
                    value={bodyDraft}
                    onChange={e => setBodyDraft(e.target.value)}
                    className="w-full h-80 p-3 bg-input-background border border-border rounded-xl text-sm text-foreground font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {saveMessage && <p className={`text-xs ${saveMessage.toLowerCase().includes("não foi") ? "text-red-600" : "text-emerald-600"}`}>{saveMessage}</p>}
                <div className="flex justify-end">
                  <Btn variant="primary" onClick={handleSave} disabled={saving || !subscriptionUnlocked}>{saving ? "Salvando..." : "Salvar modelo"}</Btn>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-semibold text-foreground font-display mb-2">Campos disponíveis</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Os campos abaixo são substituídos automaticamente ao gerar o documento pra um paciente (aba "Cadastro" do prontuário). Os marcados como manuais ficam visíveis como texto pra você preencher antes de exportar o PDF.
                </p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_PLACEHOLDERS.map(p => (
                    <Badge key={p.key} variant={p.autoFilled ? "outline" : "warning"}>{`{{${p.key}}}`} — {p.label}</Badge>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
      )}
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

const TARGET_AUDIENCE_OPTIONS = ["Crianças", "Adolescentes", "Adultos", "Idosos"];

type AvailabilitySlotRow = { id: string; weekday: number; start_time: string; end_time: string };

function ProfessionalSettingsScreen({ onNavigate, currentUser, onSignOut }: AuthenticatedScreenProps) {
  const navItems = [
    { icon: <Home size={18} />, label: "Início", onClick: () => onNavigate("pro-dashboard") },
    { icon: <Calendar size={18} />, label: "Agenda", onClick: () => onNavigate("calendar") },
    { icon: <Users size={18} />, label: "Pacientes", onClick: () => onNavigate("patients") },
    { icon: <FileText size={18} />, label: "Prontuários", onClick: () => onNavigate("ehr") },
    { icon: <BookOpen size={18} />, label: "Biblioteca", onClick: () => onNavigate("library") },
    { icon: <Brain size={18} />, label: "IA Assistente", onClick: () => onNavigate("ai-assistant") },
    { icon: <BarChart2 size={18} />, label: "Financeiro", onClick: () => onNavigate("financial") },
    { icon: <Settings size={18} />, label: "Configurações", active: true, onClick: () => onNavigate("professional-settings") },
  ];

  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [slug, setSlug] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [cpf, setCpf] = useState("");
  const [personType, setPersonType] = useState<"fisica" | "juridica">("fisica");
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [passFeeToPatient, setPassFeeToPatient] = useState(false);
  const [autoChargeEnabled, setAutoChargeEnabled] = useState(false);
  const [autoChargeDaysBefore, setAutoChargeDaysBefore] = useState("1");
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
  const [targetAudience, setTargetAudience] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [locations, setLocations] = useState<ProfessionalLocation[]>([]);
  const [services, setServices] = useState<ProfessionalService[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [newLocationLabel, setNewLocationLabel] = useState("");
  const [newLocationCity, setNewLocationCity] = useState("");
  const [newLocationState, setNewLocationState] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("50");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [savingService, setSavingService] = useState(false);

  const loadLocationsAndServices = async () => {
    setLoadingLocations(true);
    try {
      const [locs, svcs] = await Promise.all([listLocations(currentUser.id), listServices(currentUser.id)]);
      setLocations(locs);
      setServices(svcs);
    } catch (error) {
      reportError(error, { flow: "professionalSettings.loadLocationsAndServices" });
    } finally {
      setLoadingLocations(false);
    }
  };

  useEffect(() => {
    void loadLocationsAndServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleAddLocation = async () => {
    if (!newLocationLabel.trim()) return;
    setSavingLocation(true);
    try {
      await createLocation(currentUser.id, {
        label: newLocationLabel.trim(),
        addressStreet: null, addressNumber: null, addressComplement: null, addressNeighborhood: null,
        addressCity: newLocationCity.trim() || null, addressState: newLocationState.trim() || null, addressZip: null,
        isPrimary: locations.length === 0,
      });
      setNewLocationLabel("");
      setNewLocationCity("");
      setNewLocationState("");
      await loadLocationsAndServices();
    } catch (error) {
      reportError(error, { flow: "professionalSettings.addLocation" });
    } finally {
      setSavingLocation(false);
    }
  };

  const handleRemoveLocation = async (id: string) => {
    try {
      await deleteLocation(id);
      await loadLocationsAndServices();
    } catch (error) {
      reportError(error, { flow: "professionalSettings.removeLocation" });
    }
  };

  const handleAddService = async () => {
    const price = Number(newServicePrice);
    if (!newServiceName.trim() || !newServicePrice || Number.isNaN(price) || price < 0) return;
    setSavingService(true);
    try {
      await createService(currentUser.id, {
        name: newServiceName.trim(),
        durationMinutes: Math.max(1, Number(newServiceDuration) || 50),
        price,
        modality: null,
        active: true,
      });
      setNewServiceName("");
      setNewServiceDuration("50");
      setNewServicePrice("");
      await loadLocationsAndServices();
    } catch (error) {
      reportError(error, { flow: "professionalSettings.addService" });
    } finally {
      setSavingService(false);
    }
  };

  const handleRemoveService = async (id: string) => {
    try {
      await deleteService(id);
      await loadLocationsAndServices();
    } catch (error) {
      reportError(error, { flow: "professionalSettings.removeService" });
    }
  };

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [invitingStaff, setInvitingStaff] = useState(false);
  const [staffMessage, setStaffMessage] = useState("");

  const loadStaff = async () => {
    setLoadingStaff(true);
    try {
      setStaff(await listMyStaff(currentUser.id));
    } catch (error) {
      reportError(error, { flow: "professionalSettings.loadStaff" });
    } finally {
      setLoadingStaff(false);
    }
  };

  useEffect(() => {
    void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleInviteStaff = async () => {
    setStaffMessage("");
    if (!newStaffName.trim() || !newStaffEmail.trim()) return;
    setInvitingStaff(true);
    const result = await inviteStaffMember(newStaffName.trim(), newStaffEmail.trim());
    setInvitingStaff(false);
    if (!result.ok) {
      setStaffMessage(result.error);
      return;
    }
    setNewStaffName("");
    setNewStaffEmail("");
    setStaffMessage("Convite enviado! A secretária define a própria senha ao aceitar.");
    await loadStaff();
  };

  const handleRemoveStaff = async (id: string) => {
    if (!window.confirm("Remover o acesso desta secretária?")) return;
    try {
      await removeStaffMember(id);
      await loadStaff();
    } catch (error) {
      reportError(error, { flow: "professionalSettings.removeStaff" });
    }
  };

  const [clinicProfessionals, setClinicProfessionals] = useState<ClinicProfessional[]>([]);
  const [loadingClinicProfessionals, setLoadingClinicProfessionals] = useState(true);
  const [newClinicProName, setNewClinicProName] = useState("");
  const [newClinicProEmail, setNewClinicProEmail] = useState("");
  const [newClinicProLicense, setNewClinicProLicense] = useState("");
  const [invitingClinicPro, setInvitingClinicPro] = useState(false);
  const [clinicProMessage, setClinicProMessage] = useState("");

  const loadClinicProfessionals = async () => {
    setLoadingClinicProfessionals(true);
    try {
      setClinicProfessionals(await listClinicProfessionals(currentUser.id));
    } catch (error) {
      reportError(error, { flow: "professionalSettings.loadClinicProfessionals" });
    } finally {
      setLoadingClinicProfessionals(false);
    }
  };

  useEffect(() => {
    void loadClinicProfessionals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleInviteClinicPro = async () => {
    setClinicProMessage("");
    if (!newClinicProName.trim() || !newClinicProEmail.trim() || !newClinicProLicense.trim()) return;
    setInvitingClinicPro(true);
    const result = await inviteClinicProfessional(newClinicProName.trim(), newClinicProEmail.trim(), newClinicProLicense, newClinicProLicense.trim());
    setInvitingClinicPro(false);
    if (!result.ok) {
      setClinicProMessage(result.error);
      return;
    }
    setNewClinicProName("");
    setNewClinicProEmail("");
    setNewClinicProLicense("");
    setClinicProMessage("Convite enviado! O psicólogo define a própria senha ao aceitar e já entra coberto pela assinatura da clínica.");
    await loadClinicProfessionals();
  };

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [mySubscription, setMySubscription] = useState<ProfessionalSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingSubscription(true);
      try {
        const [planList, subscription] = await Promise.all([listPlans(), getMySubscription(currentUser.id)]);
        setPlans(planList);
        setMySubscription(subscription);
      } catch (error) {
        reportError(error, { flow: "professionalSettings.loadSubscription" });
      } finally {
        setLoadingSubscription(false);
      }
    })();
  }, [currentUser.id]);

  const handleSubscribe = async (planId: string) => {
    setSubscriptionError("");
    setSubscribing(true);
    const result = await createSubscription(planId, couponPreview?.valid ? couponCode : undefined);
    setSubscribing(false);
    if (!result.ok) {
      setSubscriptionError(result.error);
      return;
    }
    window.location.href = result.checkoutUrl;
  };

  // Coupon preview is validated against the first plan on the list — fine while there's only one
  // plan (see 20260719000004_subscription_plans.sql's note that tiering isn't implemented yet);
  // create-asaas-subscription re-validates server-side against whichever plan is actually subscribed
  // to, so this is purely a display simplification, never a source of an incorrect charge.
  const [couponCode, setCouponCode] = useState("");
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim() || !plans[0]) return;
    setValidatingCoupon(true);
    setCouponPreview(await validateCoupon(couponCode, plans[0].id));
    setValidatingCoupon(false);
  };

  const toggleTargetAudience = (value: string) => {
    setTargetAudience(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
  };

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
        .select("license_type, license_number, bio, specialties, approaches, session_price, modalities, city, state, insurances, years_experience, target_audience, logo_url, cover_url, slug, accent_color, cpf, person_type, cnpj, razao_social, pass_fee_to_patient, auto_charge_enabled, auto_charge_days_before")
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
        setTargetAudience(data.target_audience ?? []);
        setLogoUrl(data.logo_url ?? "");
        setCoverUrl(data.cover_url ?? "");
        setSlug(data.slug ?? "");
        setAccentColor(data.accent_color ?? "");
        setCpf(data.cpf ?? "");
        setPersonType((data.person_type as "fisica" | "juridica") ?? "fisica");
        setCnpj(data.cnpj ?? "");
        setRazaoSocial(data.razao_social ?? "");
        setPassFeeToPatient(Boolean(data.pass_fee_to_patient));
        setAutoChargeEnabled(Boolean(data.auto_charge_enabled));
        setAutoChargeDaysBefore(String(data.auto_charge_days_before ?? 1));
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

    const normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

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
        target_audience: targetAudience,
        cpf: cpf.trim() || null,
        person_type: personType,
        cnpj: personType === "juridica" ? cnpj.trim() || null : null,
        razao_social: personType === "juridica" ? razaoSocial.trim() || null : null,
        pass_fee_to_patient: passFeeToPatient,
        auto_charge_enabled: autoChargeEnabled,
        auto_charge_days_before: Math.max(1, Number(autoChargeDaysBefore) || 1),
        slug: normalizedSlug || null,
        accent_color: accentColor || null,
      })
      .eq("id", currentUser.id);

    setSaving(false);
    setSlug(normalizedSlug);

    if (error) {
      reportError(error, { flow: "professionalSettings.saveProfile" });
      setSaveMessage(error.message.includes("professional_profiles_slug_key") ? "Esse endereço já está em uso por outro profissional." : "Não foi possível salvar. Tente novamente.");
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

  const handleUploadLogo = async (file: File) => {
    setLogoError("");
    setUploadingLogo(true);
    try {
      const url = await uploadLogo(currentUser.id, file);
      setLogoUrl(url);
    } catch (error) {
      reportError(error, { flow: "professionalSettings.uploadLogo" });
      setLogoError(error instanceof Error ? error.message : "Não foi possível enviar o logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleUploadCover = async (file: File) => {
    setCoverError("");
    setUploadingCover(true);
    try {
      const url = await uploadCoverImage(currentUser.id, file);
      setCoverUrl(url);
    } catch (error) {
      reportError(error, { flow: "professionalSettings.uploadCover" });
      setCoverError(error instanceof Error ? error.message : "Não foi possível enviar a capa.");
    } finally {
      setUploadingCover(false);
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
      <AppShell title="Configurações" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Configurações" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser} onNotificationClick={() => onNavigate("patients")}>
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

          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-20 h-20 rounded-2xl object-contain bg-secondary p-2" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground text-xs text-center px-2">Sem logo</div>
            )}
            <div>
              <label className="cursor-pointer">
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-border hover:bg-muted ${uploadingLogo ? "opacity-50 pointer-events-none" : ""}`}>
                  <Upload size={14} />{uploadingLogo ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  disabled={uploadingLogo}
                  onChange={e => { const file = e.target.files?.[0]; if (file) void handleUploadLogo(file); e.target.value = ""; }}
                />
              </label>
              <p className="text-xs text-muted-foreground mt-1.5">Aparece nos recibos e documentos em PDF e no seu perfil público.</p>
              {logoError && <p className="text-xs text-red-600 mt-1">{logoError}</p>}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {coverUrl ? (
              <img src={coverUrl} alt="Capa" className="w-32 h-16 rounded-xl object-cover bg-secondary" />
            ) : (
              <div className="w-32 h-16 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground text-xs text-center px-2">Sem capa</div>
            )}
            <div>
              <label className="cursor-pointer">
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-border hover:bg-muted ${uploadingCover ? "opacity-50 pointer-events-none" : ""}`}>
                  <Upload size={14} />{uploadingCover ? "Enviando..." : coverUrl ? "Trocar capa" : "Enviar capa"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  disabled={uploadingCover}
                  onChange={e => { const file = e.target.files?.[0]; if (file) void handleUploadCover(file); e.target.value = ""; }}
                />
              </label>
              <p className="text-xs text-muted-foreground mt-1.5">Imagem de fundo do seu perfil público (opcional).</p>
              {coverError && <p className="text-xs text-red-600 mt-1">{coverError}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Endereço personalizado (opcional)" placeholder="seu-nome" value={slug} onChange={setSlug} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Cor de destaque</label>
              <div className="flex gap-2 items-center">
                {["", "#1B7A48", "#3B6FA8", "#E8A33D", "#8B5CF6", "#EC4899"].map(color => (
                  <button
                    key={color || "default"}
                    type="button"
                    onClick={() => setAccentColor(color)}
                    className={`w-7 h-7 rounded-full border-2 ${accentColor === color ? "border-foreground" : "border-transparent"}`}
                    style={{ background: color || "linear-gradient(135deg, #1B7A48, #3B6FA8)" }}
                    title={color || "Padrão"}
                  />
                ))}
              </div>
            </div>
          </div>
          {slug && <p className="text-xs text-muted-foreground -mt-2">Seu perfil: {window.location.origin}/perfil/{slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")}</p>}

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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Público-alvo</label>
            <div className="flex flex-wrap gap-3">
              {TARGET_AUDIENCE_OPTIONS.map(option => (
                <label key={option} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={targetAudience.includes(option)} onChange={() => toggleTargetAudience(option)} />
                  {option}
                </label>
              ))}
            </div>
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
          <h2 className="font-semibold text-foreground font-display">Faturamento e recibos</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Tipo de cadastro</label>
            <div className="flex gap-2 max-w-xs">
              <button type="button" onClick={() => setPersonType("fisica")} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${personType === "fisica" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>Pessoa Física</button>
              <button type="button" onClick={() => setPersonType("juridica")} className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${personType === "juridica" ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}>Pessoa Jurídica</button>
            </div>
          </div>

          {personType === "fisica" ? (
            <Input label="CPF" placeholder="000.000.000-00" value={cpf} onChange={setCpf} className="max-w-xs" />
          ) : (
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <Input label="CNPJ" placeholder="00.000.000/0001-00" value={cnpj} onChange={setCnpj} />
              <Input label="Razão social" placeholder="Nome da empresa" value={razaoSocial} onChange={setRazaoSocial} />
            </div>
          )}
          <p className="text-xs text-muted-foreground -mt-2">Necessário pro recibo em PDF sair completo pra usar no app Receita Saúde.</p>

          <label className="flex items-start gap-2 text-sm text-foreground pt-2 border-t border-border cursor-pointer">
            <input
              type="checkbox"
              checked={passFeeToPatient}
              onChange={e => setPassFeeToPatient(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              Repassar a taxa da plataforma ao paciente
              <span className="block text-xs text-muted-foreground mt-0.5">
                Com isso ligado, a taxa é somada ao valor cobrado do paciente no checkout em vez de ser descontada do seu repasse — o que você recebe por sessão não muda.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-foreground pt-2 border-t border-border cursor-pointer">
            <input
              type="checkbox"
              checked={autoChargeEnabled}
              onChange={e => setAutoChargeEnabled(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              Cobrança automática via Pix
              <span className="block text-xs text-muted-foreground mt-0.5">
                Gera a cobrança Pix sozinha alguns dias antes de cada sessão agendada — sem repetir se o paciente não pagar.
              </span>
            </span>
          </label>
          {autoChargeEnabled && (
            <Input
              label="Dias de antecedência"
              type="number"
              value={autoChargeDaysBefore}
              onChange={setAutoChargeDaysBefore}
              className="max-w-xs"
            />
          )}

          <Btn variant="primary" onClick={handleSaveProfile} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Btn>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground font-display">Meu plano</h2>

          {loadingSubscription && <p className="text-sm text-muted-foreground">Carregando...</p>}

          {!loadingSubscription && mySubscription?.status === "active" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span className="font-medium">{mySubscription.planName}</span> — ativo
              {mySubscription.currentPeriodEnd && (
                <span className="block text-xs mt-0.5">Próximo pagamento em {new Date(mySubscription.currentPeriodEnd).toLocaleDateString("pt-BR")}</span>
              )}
            </div>
          )}
          {!loadingSubscription && mySubscription?.status === "pending" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 space-y-2">
              <p>Assinatura de <span className="font-medium">{mySubscription.planName}</span> aguardando pagamento.</p>
              <Btn variant="primary" size="sm" onClick={() => handleSubscribe(mySubscription!.planId)} disabled={subscribing}>
                {subscribing ? "Redirecionando..." : "Pagar agora"}
              </Btn>
              {subscriptionError && <p className="text-red-700">{subscriptionError}</p>}
            </div>
          )}
          {!loadingSubscription && (!mySubscription || mySubscription.status === "cancelled" || mySubscription.status === "past_due") && (
            <>
              <p className="text-xs text-muted-foreground">Assine pra apoiar a plataforma além da comissão por consulta.</p>

              <div className="flex items-end gap-2">
                <Input
                  label="Cupom de desconto"
                  placeholder="Ex: BEMVINDO10"
                  icon={<Tag size={15} />}
                  value={couponCode}
                  onChange={v => { setCouponCode(v.toUpperCase()); setCouponPreview(null); }}
                  className="max-w-xs"
                />
                <Btn variant="outline" size="sm" disabled={validatingCoupon || !couponCode.trim()} onClick={handleApplyCoupon}>
                  {validatingCoupon ? "Aplicando..." : "Aplicar"}
                </Btn>
              </div>
              {couponPreview && !couponPreview.valid && <p className="text-xs text-red-600">{couponPreview.error}</p>}
              {couponPreview && couponPreview.valid && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-1.5">
                  <Percent size={13} />
                  Cupom aplicado: de R${couponPreview.originalPrice.toFixed(2).replace(".", ",")} por{" "}
                  <span className="font-semibold">R${couponPreview.discountedPrice.toFixed(2).replace(".", ",")}/mês</span>
                </div>
              )}

              {plans.map(plan => {
                const discounted = couponPreview?.valid && plan.id === plans[0]?.id ? couponPreview.discountedPrice : null;
                return (
                  <div key={plan.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{plan.name}</span>
                      {discounted !== null ? (
                        <span className="text-muted-foreground">
                          {" — "}
                          <span className="line-through">R${plan.price.toFixed(2).replace(".", ",")}</span>{" "}
                          <span className="text-emerald-700 font-medium">R${discounted.toFixed(2).replace(".", ",")}/mês</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground"> — R${plan.price.toFixed(2).replace(".", ",")}/mês</span>
                      )}
                    </div>
                    <Btn variant="primary" size="sm" onClick={() => handleSubscribe(plan.id)} disabled={subscribing}>
                      {subscribing ? "Redirecionando..." : "Assinar"}
                    </Btn>
                  </div>
                );
              })}
              {subscriptionError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{subscriptionError}</div>}
            </>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground font-display">Locais e Serviços</h2>
          <p className="text-xs text-muted-foreground -mt-2">Aparecem no seu perfil público e como opção rápida ao criar uma consulta na Agenda.</p>

          {loadingLocations && <p className="text-sm text-muted-foreground">Carregando...</p>}

          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Locais de atendimento</h3>
            <div className="space-y-2 mb-3">
              {locations.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-foreground">{l.label}</span>
                    {(l.addressCity || l.addressState) && <span className="text-muted-foreground"> · {[l.addressCity, l.addressState].filter(Boolean).join(", ")}</span>}
                  </div>
                  <button type="button" onClick={() => handleRemoveLocation(l.id)} className="text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-4 gap-2">
              <Input placeholder="Nome (ex.: Consultório Centro)" value={newLocationLabel} onChange={setNewLocationLabel} className="sm:col-span-2" />
              <Input placeholder="Cidade" value={newLocationCity} onChange={setNewLocationCity} />
              <Input placeholder="UF" value={newLocationState} onChange={setNewLocationState} />
            </div>
            <Btn variant="outline" size="sm" className="mt-2" onClick={handleAddLocation} disabled={savingLocation || !newLocationLabel.trim()}>
              <Plus size={13} />Adicionar local
            </Btn>
          </div>

          <div className="pt-3 border-t border-border">
            <h3 className="text-sm font-medium text-foreground mb-2">Serviços oferecidos</h3>
            <div className="space-y-2 mb-3">
              {services.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="text-muted-foreground"> · {s.durationMinutes}min · R${s.price.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <button type="button" onClick={() => handleRemoveService(s.id)} className="text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-4 gap-2">
              <Input placeholder="Nome (ex.: Sessão individual)" value={newServiceName} onChange={setNewServiceName} className="sm:col-span-2" />
              <Input placeholder="Duração (min)" type="number" value={newServiceDuration} onChange={setNewServiceDuration} />
              <Input placeholder="Valor (R$)" type="number" value={newServicePrice} onChange={setNewServicePrice} />
            </div>
            <Btn variant="outline" size="sm" className="mt-2" onClick={handleAddService} disabled={savingService || !newServiceName.trim() || !newServicePrice}>
              <Plus size={13} />Adicionar serviço
            </Btn>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground font-display">Equipe</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Secretárias têm acesso só à Agenda e à lista de Pacientes — nunca ao Financeiro nem ao conteúdo clínico do Prontuário.
          </p>

          {loadingStaff && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loadingStaff && staff.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma secretária com acesso ainda.</p>}
          <div className="space-y-2">
            {staff.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{s.fullName}</span>
                <button type="button" onClick={() => handleRemoveStaff(s.id)} className="text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            <Input placeholder="Nome da secretária" value={newStaffName} onChange={setNewStaffName} />
            <Input placeholder="E-mail" type="email" value={newStaffEmail} onChange={setNewStaffEmail} />
          </div>
          {staffMessage && (
            <div className={`rounded-xl border px-3 py-2 text-sm ${staffMessage.includes("enviado") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {staffMessage}
            </div>
          )}
          <Btn variant="outline" size="sm" onClick={handleInviteStaff} disabled={invitingStaff || !newStaffName.trim() || !newStaffEmail.trim()}>
            <Plus size={13} />{invitingStaff ? "Convidando..." : "Convidar secretária"}
          </Btn>
        </Card>

        {personType === "juridica" && (
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold text-foreground font-display">Psicólogos da clínica</h2>
            <p className="text-xs text-muted-foreground -mt-2">
              Cada psicólogo cadastrado tem sua própria agenda, pacientes e prontuário — só ficam agrupados sob a marca da clínica e cobertos pela mesma assinatura, sem precisar de plano próprio.
            </p>

            {loadingClinicProfessionals && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!loadingClinicProfessionals && clinicProfessionals.length === 0 && <p className="text-sm text-muted-foreground">Nenhum psicólogo cadastrado na clínica ainda.</p>}
            <div className="space-y-2">
              {clinicProfessionals.map(p => (
                <div key={p.id} className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground">
                  {p.fullName}
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-3 gap-2">
              <Input placeholder="Nome do psicólogo" value={newClinicProName} onChange={setNewClinicProName} />
              <Input placeholder="E-mail" type="email" value={newClinicProEmail} onChange={setNewClinicProEmail} />
              <Input placeholder="CRP/CRM (ex: CRP 06/12345)" value={newClinicProLicense} onChange={setNewClinicProLicense} />
            </div>
            {clinicProMessage && (
              <div className={`rounded-xl border px-3 py-2 text-sm ${clinicProMessage.includes("enviado") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                {clinicProMessage}
              </div>
            )}
            <Btn variant="outline" size="sm" onClick={handleInviteClinicPro} disabled={invitingClinicPro || !newClinicProName.trim() || !newClinicProEmail.trim() || !newClinicProLicense.trim()}>
              <Plus size={13} />{invitingClinicPro ? "Convidando..." : "Cadastrar psicólogo"}
            </Btn>
          </Card>
        )}

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
  const [adminTab, setAdminTab] = useState<"validations" | "users" | "payments" | "coupons">("validations");
  const navItems = [
    { icon: <Home size={18} />, label: "Visão geral", active: true, onClick: () => setAdminTab("validations") },
    { icon: <Shield size={18} />, label: "Validações", onClick: () => setAdminTab("validations") },
    { icon: <Users size={18} />, label: "Usuários", onClick: () => setAdminTab("users") },
    { icon: <CreditCard size={18} />, label: "Pagamentos", onClick: () => setAdminTab("payments") },
    { icon: <Tag size={18} />, label: "Cupons", onClick: () => setAdminTab("coupons") },
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

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [couponActionId, setCouponActionId] = useState<string | null>(null);
  const [newCoupon, setNewCoupon] = useState({
    code: "",
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: "",
    maxRedemptions: "",
    maxRedemptionsPerUser: "1",
    expiresAt: "",
  });
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [couponFormError, setCouponFormError] = useState<string | null>(null);

  const loadCoupons = async () => {
    setLoadingCoupons(true);
    try {
      setCoupons(await listCoupons());
    } catch (error) {
      reportError(error, { flow: "adminPanel.loadCoupons" });
    }
    setLoadingCoupons(false);
  };

  const handleCreateCoupon = async () => {
    setCouponFormError(null);
    const discountValue = Number(newCoupon.discountValue.replace(",", "."));
    if (!newCoupon.code.trim()) { setCouponFormError("Informe um código."); return; }
    if (!discountValue || discountValue <= 0) { setCouponFormError("Informe um valor de desconto válido."); return; }
    if (newCoupon.discountType === "percentage" && discountValue > 100) { setCouponFormError("Desconto percentual não pode passar de 100%."); return; }

    setCreatingCoupon(true);
    try {
      await createCoupon({
        code: newCoupon.code,
        discountType: newCoupon.discountType,
        discountValue,
        maxRedemptions: newCoupon.maxRedemptions ? Number(newCoupon.maxRedemptions) : null,
        maxRedemptionsPerUser: Number(newCoupon.maxRedemptionsPerUser) || 1,
        startsAt: null,
        expiresAt: newCoupon.expiresAt ? new Date(newCoupon.expiresAt).toISOString() : null,
      });
      setNewCoupon({ code: "", discountType: "percentage", discountValue: "", maxRedemptions: "", maxRedemptionsPerUser: "1", expiresAt: "" });
      await loadCoupons();
    } catch (error) {
      reportError(error, { flow: "adminPanel.createCoupon" });
      setCouponFormError(error instanceof Error && error.message.includes("duplicate") ? "Já existe um cupom com esse código." : "Não foi possível criar o cupom.");
    }
    setCreatingCoupon(false);
  };

  const handleToggleCouponActive = async (coupon: Coupon) => {
    setCouponActionId(coupon.id);
    try {
      await setCouponActive(coupon.id, !coupon.active);
      await loadCoupons();
    } catch (error) {
      reportError(error, { flow: "adminPanel.toggleCoupon" });
    }
    setCouponActionId(null);
  };

  const handleDeleteCoupon = async (coupon: Coupon) => {
    if (!window.confirm(`Excluir o cupom "${coupon.code}"? Essa ação não pode ser desfeita.`)) return;
    setCouponActionId(coupon.id);
    try {
      await deleteCoupon(coupon.id);
      setCoupons(prev => prev.filter(c => c.id !== coupon.id));
    } catch (error) {
      reportError(error, { flow: "adminPanel.deleteCoupon" });
      window.alert("Não foi possível excluir o cupom.");
    }
    setCouponActionId(null);
  };

  const [verifiedCount, setVerifiedCount] = useState(0);
  const [sessionNotesCount, setSessionNotesCount] = useState<number | null>(null);

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
    const { data, error } = await invokeEdgeFunction("admin-manage-user", { body: { action, userId: id } });
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

    // Metadata only (created_at/professional_id/has_notes/has_ai_summary) — never the clinical
    // text itself. See admin_session_notes_overview() (security definer, RLS no longer grants
    // admin any direct row access to session_notes content).
    (async () => {
      const { data } = await supabase.rpc("admin_session_notes_overview");
      setSessionNotesCount((data ?? []).length);
    })();

    void loadUsers();
    void loadCoupons();

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
    { label: "Notas de sessão (metadados)", value: sessionNotesCount === null ? "…" : String(sessionNotesCount), icon: <FileText size={18} />, color: "purple" as const },
  ];

  const filteredUsers = users.filter(u => {
    const matchSearch = !userSearch.trim() || u.name.toLowerCase().includes(userSearch.trim().toLowerCase());
    const matchType = userTypeFilter === "all" || u.role === userTypeFilter;
    return matchSearch && matchType;
  });

  const roleLabel = (role: UserRole) => role === "professional" ? "Profissional" : role === "admin" ? "Admin" : "Paciente";

  return (
    <AppShell title="Painel Administrativo" navItems={navItems} userName={currentUser.fullName} onSignOut={onSignOut} currentUser={currentUser}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statsData.map(s => (
            <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} color={s.color} />
          ))}
        </div>

        <div className="flex gap-2 border-b border-border">
          {[{ id: "validations" as const, label: "Validações pendentes" }, { id: "users" as const, label: "Usuários" }, { id: "payments" as const, label: "Pagamentos" }, { id: "coupons" as const, label: "Cupons" }].map(t => (
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

        {adminTab === "coupons" && (
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold text-foreground font-display mb-4">Novo cupom</h3>
              <p className="text-xs text-muted-foreground mb-4">Cupons valem apenas para a assinatura da plataforma do profissional (psicólogo), não para o pagamento de sessões dos pacientes.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Input placeholder="Código (ex: BEMVINDO10)" value={newCoupon.code} onChange={v => setNewCoupon(prev => ({ ...prev, code: v.toUpperCase() }))} />
                <select
                  value={newCoupon.discountType}
                  onChange={e => setNewCoupon(prev => ({ ...prev, discountType: e.target.value as "percentage" | "fixed" }))}
                  className="px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none"
                >
                  <option value="percentage">Percentual (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
                <Input placeholder={newCoupon.discountType === "percentage" ? "Desconto (ex: 10)" : "Desconto (ex: 20,00)"} value={newCoupon.discountValue} onChange={v => setNewCoupon(prev => ({ ...prev, discountValue: v }))} />
                <Input placeholder="Limite total de usos (opcional)" value={newCoupon.maxRedemptions} onChange={v => setNewCoupon(prev => ({ ...prev, maxRedemptions: v.replace(/\D/g, "") }))} />
                <Input placeholder="Usos por profissional" value={newCoupon.maxRedemptionsPerUser} onChange={v => setNewCoupon(prev => ({ ...prev, maxRedemptionsPerUser: v.replace(/\D/g, "") }))} />
                <input
                  type="date"
                  value={newCoupon.expiresAt}
                  onChange={e => setNewCoupon(prev => ({ ...prev, expiresAt: e.target.value }))}
                  className="px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none"
                />
              </div>
              {couponFormError && <p className="text-xs text-red-600 mt-2">{couponFormError}</p>}
              <Btn variant="primary" size="sm" className="mt-4" disabled={creatingCoupon} onClick={handleCreateCoupon}>
                <Plus size={14} />{creatingCoupon ? "Criando..." : "Criar cupom"}
              </Btn>
            </Card>

            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground font-display">Cupons cadastrados</h3>
              </div>
              {loadingCoupons && <p className="text-sm text-muted-foreground p-4">Carregando cupons...</p>}
              {!loadingCoupons && coupons.length === 0 && <p className="text-sm text-muted-foreground p-4">Nenhum cupom criado ainda.</p>}
              {!loadingCoupons && coupons.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-muted/50">
                      <tr>{["Código", "Desconto", "Usos", "Validade", "Status", "Ações"].map(h => <th key={h} className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {coupons.map(c => (
                        <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-foreground flex items-center gap-1.5"><Tag size={13} className="text-muted-foreground" />{c.code}</td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {c.discountType === "percentage" ? `${c.discountValue}%` : `R$${c.discountValue.toFixed(2).replace(".", ",")}`}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{c.redemptionCount}{c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ""}</td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("pt-BR") : "Sem validade"}</td>
                          <td className="py-3 px-4">{c.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Btn variant="outline" size="sm" disabled={couponActionId === c.id} onClick={() => handleToggleCouponActive(c)}>
                                {c.active ? "Desativar" : "Ativar"}
                              </Btn>
                              <Btn variant="danger" size="sm" disabled={couponActionId === c.id} onClick={() => handleDeleteCoupon(c)}>Excluir</Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
  const [confirmationToken, setConfirmationToken] = useState<string | null>(() => pathToScreen(window.location.pathname)?.confirmationToken ?? null);
  const [openPatientSettingsOnLoad, setOpenPatientSettingsOnLoad] = useState(false);

  // "Which professional's data am I acting on" — always the professional themselves for a plain
  // professional account; for staff (secretária), whichever clinic-mate they've picked from the
  // switcher (defaults to the first one loaded). RLS (can_access_professional, migration
  // 20260719000001) is the real enforcement point — this is just which id the UI queries with.
  const [activeProfessionalId, setActiveProfessionalId] = useState<string | null>(null);
  const [staffProfessionals, setStaffProfessionals] = useState<ClinicProfessional[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setActiveProfessionalId(null);
      setStaffProfessionals([]);
      return;
    }
    if (currentUser.role === "professional") {
      setActiveProfessionalId(currentUser.id);
      return;
    }
    if (currentUser.role === "staff") {
      let active = true;
      listMyProfessionals(currentUser.id).then(list => {
        if (!active) return;
        setStaffProfessionals(list);
        setActiveProfessionalId(prev => prev ?? list[0]?.id ?? null);
      }).catch(error => reportError(error, { flow: "app.loadStaffProfessionals" }));
      return () => { active = false; };
    }
  }, [currentUser?.id, currentUser?.role]);

  // Payment gate: before the professional (or the clinic they belong to) has an active
  // subscription, Agenda/Pacientes/Prontuário/Financeiro/IA/Biblioteca stay visible (so they can
  // see what the product does) but every write action in them is disabled — Configurações/Meu
  // plano is deliberately exempt, since that's how they actually get to paying. Purely a UI gate
  // (see getSubscriptionAccess); irrelevant for patients/admin, so only computed for
  // professional/staff roles once activeProfessionalId resolves.
  const [subscriptionUnlocked, setSubscriptionUnlocked] = useState(true);

  useEffect(() => {
    if (!activeProfessionalId || !currentUser || (currentUser.role !== "professional" && currentUser.role !== "staff")) {
      setSubscriptionUnlocked(true);
      return;
    }
    let active = true;
    getSubscriptionAccess(activeProfessionalId).then(access => {
      if (active) setSubscriptionUnlocked(access.unlocked);
    }).catch(error => reportError(error, { flow: "app.loadSubscriptionAccess" }));
    return () => { active = false; };
  }, [activeProfessionalId, currentUser?.role]);

  // Asaas's callback only has a single successUrl (no separate pending/failure redirect like
  // Mercado Pago's back_urls) — a payment that's still pending or failed just leaves the patient on
  // Asaas's own invoice page, it never bounces them back here, so there's nothing to represent but
  // "success" ever landing in this query param.
  const [paymentReturnStatus, setPaymentReturnStatus] = useState<"success" | null>(null);
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
      if (parsed?.confirmationToken) setConfirmationToken(parsed.confirmationToken);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const asaasStatus = new URLSearchParams(window.location.search).get("asaas");
    if (asaasStatus === "success") {
      setPaymentReturnStatus("success");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const noTopNavScreens: Screen[] = ["video", "patient-dashboard", "pro-dashboard", "calendar", "patients", "ehr", "ai-assistant", "financial", "admin", "professional-settings", "confirm-attendance"];
  const protectedScreens: Screen[] = ["patient-dashboard", "pro-dashboard", "calendar", "patients", "ehr", "ai-assistant", "video", "checkout", "financial", "library", "admin", "professional-settings"];
  // Screens restricted to specific roles; screens absent from this map are open to any authenticated user (e.g. video, shared by patient + professional).
  const screenRoles: Partial<Record<Screen, UserRole[]>> = {
    "patient-dashboard": ["patient"],
    "pro-dashboard": ["professional"],
    calendar: ["professional", "staff"],
    patients: ["professional", "staff"],
    ehr: ["professional"],
    "ai-assistant": ["professional"],
    financial: ["professional"],
    library: ["professional"],
    "professional-settings": ["professional"],
    admin: ["admin"],
    checkout: ["patient"],
  };
  // Staff (secretária) never lands on pro-dashboard — it shows financial figures that are outside
  // their fixed Agenda+Pacientes scope, so their home is the Agenda directly.
  const homeScreenForRole = (role: UserRole): Screen =>
    role === "professional" ? "pro-dashboard" : role === "staff" ? "calendar" : role === "admin" ? "admin" : "patient-dashboard";
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
        // "Link de atualização de cadastro" reuses this same recovery mechanism but with its own
        // redirect path — landing here means a patient clicked that link (not "esqueci minha
        // senha"), so send them straight to the ficha cadastral instead of the password-reset screen.
        if (window.location.pathname === "/atualizar-cadastro") {
          setOpenPatientSettingsOnLoad(true);
          navigate("patient-dashboard");
        } else {
          navigate("reset-password");
        }
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

  // Asaas's successUrl lands the browser back on "/" with no session context of what happened;
  // once the user's session has loaded, send them to their dashboard to see the result.
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

  // Any Edge Function call (mark-appointment-paid, create-pix-charge, livekit-room-access, etc.)
  // can come back with "Sessão inválida." when the JWT this tab is holding no longer checks out
  // server-side (refresh token invalidated by another tab/device, session actually expired). Left
  // alone, every screen just showed that raw string next to a UI that still looked logged in.
  // invokeEdgeFunction (src/lib/functionsClient.ts) recognizes that exact message centrally and
  // reports it here, so any such failure — from any screen — signs the user out and shows a clear
  // notice on the login screen, same mechanism as the suspended-account check below.
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState("");

  useEffect(() => {
    return onSessionExpired(() => {
      setSessionExpiredNotice("Sua sessão expirou. Entre novamente.");
      void handleSignOut();
    });
  }, []);

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
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] rounded-xl border px-4 py-3 text-sm shadow-lg flex items-start justify-between gap-3 bg-emerald-50 border-emerald-200 text-emerald-800">
          <span>Pagamento aprovado! Sua consulta está confirmada.</span>
          <button type="button" onClick={() => setPaymentReturnStatus(null)} className="flex-shrink-0"><X size={16} /></button>
        </div>
      )}
      {screen === "landing" && <LandingPage onNavigate={navigate} />}
      {screen === "directory" && <DirectoryPage onNavigate={navigate} onSelectProfessional={setSelectedProfessionalId} />}
      {screen === "profile" && <ProfilePage onNavigate={navigate} professionalId={selectedProfessionalId} onBook={setBookingDraft} currentUser={currentUser} />}
      {screen === "login" && <LoginPage onNavigate={navigate} initialInfo={suspendedNotice || sessionExpiredNotice} />}
      {screen === "reset-password" && <ResetPasswordScreen onNavigate={navigate} />}
      {screen === "confirm-attendance" && <ConfirmAttendanceScreen token={confirmationToken} onNavigate={navigate} />}
      {screen === "patient-dashboard" && currentUser && (
        <PatientDashboard
          onNavigate={navigate}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          onEnterVideo={setActiveAppointmentId}
          initialTab={openPatientSettingsOnLoad ? "configuracoes" : undefined}
        />
      )}
      {screen === "pro-dashboard" && currentUser && <ProfessionalDashboard onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} onEnterVideo={setActiveAppointmentId} />}
      {screen === "calendar" && currentUser && activeProfessionalId && (
        <CalendarScreen
          onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut}
          onEnterVideo={setActiveAppointmentId} onOpenEhr={onOpenEhr}
          activeProfessionalId={activeProfessionalId} staffProfessionals={staffProfessionals} onChangeActiveProfessional={setActiveProfessionalId}
          subscriptionUnlocked={subscriptionUnlocked}
        />
      )}
      {screen === "patients" && currentUser && activeProfessionalId && (
        <PatientsScreen
          onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} onOpenEhr={onOpenEhr}
          activeProfessionalId={activeProfessionalId} staffProfessionals={staffProfessionals} onChangeActiveProfessional={setActiveProfessionalId}
          subscriptionUnlocked={subscriptionUnlocked}
        />
      )}
      {screen === "ehr" && currentUser && <EHRScreen onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} initialPatientId={ehrPatientId} initialAppointmentId={ehrAppointmentId} subscriptionUnlocked={subscriptionUnlocked} />}
      {screen === "ai-assistant" && currentUser && <AIAssistantScreen onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} subscriptionUnlocked={subscriptionUnlocked} />}
      {screen === "video" && currentUser && <VideoScreen onNavigate={navigate} currentUser={currentUser} appointmentId={activeAppointmentId} />}
      {screen === "pricing" && <PricingPage onNavigate={navigate} />}
      {screen === "checkout" && currentUser && <CheckoutScreen onNavigate={navigate} currentUser={currentUser} bookingDraft={bookingDraft} />}
      {screen === "financial" && currentUser && <FinancialDashboard onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} subscriptionUnlocked={subscriptionUnlocked} />}
      {screen === "library" && currentUser && <LibraryScreen onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} subscriptionUnlocked={subscriptionUnlocked} />}
      {screen === "professional-settings" && currentUser && <ProfessionalSettingsScreen onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} />}
      {screen === "admin" && currentUser && <AdminPanel onNavigate={navigate} currentUser={currentUser} onSignOut={handleSignOut} />}
    </div>
  );
}

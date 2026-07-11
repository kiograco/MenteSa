// Hand-written to mirror supabase/migrations/20260702000000_init_schema.sql.
// Once a real Supabase project is connected, regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "patient" | "professional" | "admin" | "staff";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type Modality = "online" | "presencial";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type PaymentStatus = "pending" | "paid" | "refunded";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: UserRole;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          terms_accepted_at: string | null;
          terms_version: string | null;
          suspended_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      professional_profiles: {
        Row: {
          id: string;
          bio: string | null;
          specialties: string[];
          approaches: string[];
          license_type: string;
          license_number: string;
          verification_status: VerificationStatus;
          session_price: number;
          modalities: Modality[];
          city: string | null;
          state: string | null;
          insurances: string[];
          years_experience: number;
          created_at: string;
          epsi_declared_at: string | null;
          target_audience: string[];
          logo_url: string | null;
          cpf: string | null;
          pass_fee_to_patient: boolean;
          auto_charge_enabled: boolean;
          auto_charge_days_before: number;
          clinic_id: string | null;
          slug: string | null;
          accent_color: string | null;
          cover_url: string | null;
          person_type: "fisica" | "juridica";
          cnpj: string | null;
          razao_social: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["professional_profiles"]["Row"]> & {
          id: string;
          license_number: string;
        };
        Update: Partial<Database["public"]["Tables"]["professional_profiles"]["Row"]>;
        Relationships: [];
      };
      subscription_plans: {
        Row: {
          id: string;
          name: string;
          price: number;
          billing_interval: string;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subscription_plans"]["Row"]> & {
          name: string;
          price: number;
        };
        Update: Partial<Database["public"]["Tables"]["subscription_plans"]["Row"]>;
        Relationships: [];
      };
      professional_subscriptions: {
        Row: {
          id: string;
          professional_id: string;
          plan_id: string;
          status: "pending" | "active" | "cancelled" | "past_due";
          mp_preapproval_id: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["professional_subscriptions"]["Row"]> & {
          professional_id: string;
          plan_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["professional_subscriptions"]["Row"]>;
        Relationships: [];
      };
      clinics: {
        Row: {
          id: string;
          name: string;
          owner_professional_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["clinics"]["Row"]> & {
          name: string;
          owner_professional_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["clinics"]["Row"]>;
        Relationships: [];
      };
      clinic_staff: {
        Row: {
          id: string;
          clinic_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["clinic_staff"]["Row"]> & {
          clinic_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["clinic_staff"]["Row"]>;
        Relationships: [];
      };
      professional_availability: {
        Row: {
          id: string;
          professional_id: string;
          weekday: number | null;
          specific_date: string | null;
          start_time: string;
          end_time: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["professional_availability"]["Row"]> & {
          professional_id: string;
          start_time: string;
          end_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["professional_availability"]["Row"]>;
        Relationships: [];
      };
      professional_locations: {
        Row: {
          id: string;
          professional_id: string;
          label: string;
          address_street: string | null;
          address_number: string | null;
          address_complement: string | null;
          address_neighborhood: string | null;
          address_city: string | null;
          address_state: string | null;
          address_zip: string | null;
          is_primary: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["professional_locations"]["Row"]> & {
          professional_id: string;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["professional_locations"]["Row"]>;
        Relationships: [];
      };
      professional_services: {
        Row: {
          id: string;
          professional_id: string;
          name: string;
          duration_minutes: number;
          price: number;
          modality: Modality | null;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["professional_services"]["Row"]> & {
          professional_id: string;
          name: string;
          price: number;
        };
        Update: Partial<Database["public"]["Tables"]["professional_services"]["Row"]>;
        Relationships: [];
      };
      professional_time_blocks: {
        Row: {
          id: string;
          professional_id: string;
          start_at: string;
          end_at: string;
          reason: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["professional_time_blocks"]["Row"]> & {
          professional_id: string;
          start_at: string;
          end_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["professional_time_blocks"]["Row"]>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          professional_id: string;
          category: string;
          amount: number;
          expense_date: string;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["expenses"]["Row"]> & {
          professional_id: string;
          category: string;
          amount: number;
          expense_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Row"]>;
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          patient_id: string;
          professional_id: string;
          scheduled_at: string;
          duration_minutes: number;
          modality: Modality;
          status: AppointmentStatus;
          price: number;
          google_event_id: string | null;
          whatsapp_reminder_sent_at: string | null;
          previous_scheduled_at: string | null;
          confirmed_at: string | null;
          confirmation_token: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["appointments"]["Row"]> & {
          patient_id: string;
          professional_id: string;
          scheduled_at: string;
          price: number;
        };
        Update: Partial<Database["public"]["Tables"]["appointments"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          appointment_id: string;
          status: PaymentStatus;
          method: string;
          amount: number;
          platform_fee: number;
          provider: string;
          provider_payment_id: string | null;
          paid_at: string | null;
          pix_qr_code: string | null;
          pix_qr_code_base64: string | null;
          pix_expires_at: string | null;
          payment_link_url: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          appointment_id: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      session_notes: {
        Row: {
          id: string;
          appointment_id: string;
          professional_id: string;
          notes: string;
          subjective: Json | null;
          objective: Json | null;
          assessment: Json | null;
          plan: Json | null;
          signed_at: string | null;
          typed_name: string | null;
          signature_hash: string | null;
          ai_summary: string | null;
          ai_summary_generated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["session_notes"]["Row"]> & {
          appointment_id: string;
          professional_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_notes"]["Row"]>;
        Relationships: [];
      };
      video_rooms: {
        Row: {
          id: string;
          appointment_id: string;
          room_url: string;
          provider_room_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["video_rooms"]["Row"]> & {
          appointment_id: string;
          room_url: string;
          provider_room_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["video_rooms"]["Row"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          appointment_id: string;
          patient_id: string;
          professional_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["reviews"]["Row"]> & {
          appointment_id: string;
          patient_id: string;
          professional_id: string;
          rating: number;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Row"]>;
        Relationships: [];
      };
      professional_documents: {
        Row: {
          id: string;
          professional_id: string;
          storage_path: string;
          file_name: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["professional_documents"]["Row"]> & {
          professional_id: string;
          storage_path: string;
          file_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["professional_documents"]["Row"]>;
        Relationships: [];
      };
      assessment_templates: {
        Row: {
          id: string;
          professional_id: string | null;
          name: string;
          questions: string[];
          answer_options: { value: number; label: string }[];
          severity_bands: { max: number | null; label: string }[];
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["assessment_templates"]["Row"]> & {
          name: string;
          questions: string[];
          answer_options: { value: number; label: string }[];
          severity_bands: { max: number | null; label: string }[];
        };
        Update: Partial<Database["public"]["Tables"]["assessment_templates"]["Row"]>;
        Relationships: [];
      };
      assessment_responses: {
        Row: {
          id: string;
          patient_id: string;
          template_id: string;
          answers: number[];
          total_score: number;
          severity: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["assessment_responses"]["Row"]> & {
          patient_id: string;
          template_id: string;
          answers: number[];
          total_score: number;
          severity: string;
        };
        Update: Partial<Database["public"]["Tables"]["assessment_responses"]["Row"]>;
        Relationships: [];
      };
      patient_materials: {
        Row: {
          id: string;
          professional_id: string;
          patient_id: string | null;
          storage_path: string;
          file_name: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["patient_materials"]["Row"]> & {
          professional_id: string;
          storage_path: string;
          file_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["patient_materials"]["Row"]>;
        Relationships: [];
      };
      patient_tasks: {
        Row: {
          id: string;
          professional_id: string;
          patient_id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["patient_tasks"]["Row"]> & {
          professional_id: string;
          patient_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["patient_tasks"]["Row"]>;
        Relationships: [];
      };
      waitlist_entries: {
        Row: {
          id: string;
          patient_id: string;
          professional_id: string;
          desired_scheduled_at: string;
          status: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["waitlist_entries"]["Row"]> & {
          patient_id: string;
          professional_id: string;
          desired_scheduled_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["waitlist_entries"]["Row"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          professional_id: string;
          patient_id: string;
          sender_id: string;
          content: string;
          created_at: string;
          read_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> & {
          professional_id: string;
          patient_id: string;
          sender_id: string;
          content: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
        Relationships: [];
      };
      patient_profiles: {
        Row: {
          id: string;
          birth_date: string | null;
          cpf: string | null;
          address_street: string | null;
          address_number: string | null;
          address_complement: string | null;
          address_neighborhood: string | null;
          address_city: string | null;
          address_state: string | null;
          address_zip: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relationship: string | null;
          legal_guardian_name: string | null;
          legal_guardian_cpf: string | null;
          legal_guardian_phone: string | null;
          legal_guardian_relationship: string | null;
          insurance_provider: string | null;
          insurance_plan: string | null;
          insurance_card_number: string | null;
          clinical_history: string | null;
          whatsapp_reminders_enabled: boolean;
          last_birthday_greeted_year: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["patient_profiles"]["Row"]> & {
          id: string;
        };
        Update: Partial<Database["public"]["Tables"]["patient_profiles"]["Row"]>;
        Relationships: [];
      };
      patient_documents: {
        Row: {
          id: string;
          patient_id: string;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["patient_documents"]["Row"]> & {
          patient_id: string;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["patient_documents"]["Row"]>;
        Relationships: [];
      };
      patient_tags: {
        Row: {
          id: string;
          professional_id: string;
          patient_id: string;
          label: string;
          color: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["patient_tags"]["Row"]> & {
          professional_id: string;
          patient_id: string;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["patient_tags"]["Row"]>;
        Relationships: [];
      };
      nota_fiscal_requests: {
        Row: {
          id: string;
          payment_id: string;
          status: string;
          provider: string | null;
          pdf_url: string | null;
          message: string | null;
          requested_at: string;
          issued_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["nota_fiscal_requests"]["Row"]> & {
          payment_id: string;
          status: string;
        };
        Update: Partial<Database["public"]["Tables"]["nota_fiscal_requests"]["Row"]>;
        Relationships: [];
      };
      generated_documents: {
        Row: {
          id: string;
          document_type: string;
          patient_id: string;
          professional_id: string;
          appointment_id: string | null;
          payment_id: string | null;
          storage_path: string;
          file_name: string;
          signed_at: string | null;
          typed_name: string | null;
          signature_hash: string | null;
          sent_to_patient_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["generated_documents"]["Row"]> & {
          document_type: string;
          patient_id: string;
          professional_id: string;
          storage_path: string;
          file_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["generated_documents"]["Row"]>;
        Relationships: [];
      };
      document_templates: {
        Row: {
          id: string;
          professional_id: string | null;
          type: string;
          title: string;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["document_templates"]["Row"]> & {
          type: string;
          title: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["document_templates"]["Row"]>;
        Relationships: [];
      };
      consent_signatures: {
        Row: {
          id: string;
          patient_id: string;
          professional_id: string;
          document_version: string;
          document_hash: string;
          typed_name: string;
          ip_address: string | null;
          user_agent: string | null;
          signed_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["consent_signatures"]["Row"]> & {
          patient_id: string;
          professional_id: string;
          document_version: string;
          document_hash: string;
          typed_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["consent_signatures"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Hand-written to mirror supabase/migrations/20260702000000_init_schema.sql.
// Once a real Supabase project is connected, regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type UserRole = "patient" | "professional" | "admin";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type Modality = "online" | "presencial";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";
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
          terms_accepted_at: string;
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
        };
        Insert: Partial<Database["public"]["Tables"]["professional_profiles"]["Row"]> & {
          id: string;
          license_number: string;
        };
        Update: Partial<Database["public"]["Tables"]["professional_profiles"]["Row"]>;
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
          ai_summary: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

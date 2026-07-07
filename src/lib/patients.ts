import { supabase } from "./supabase";

export type PatientProfile = {
  id: string;
  birthDate: string | null;
  cpf: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  legalGuardianName: string | null;
  legalGuardianCpf: string | null;
  legalGuardianPhone: string | null;
  legalGuardianRelationship: string | null;
  insuranceProvider: string | null;
  insurancePlan: string | null;
  insuranceCardNumber: string | null;
  clinicalHistory: string | null;
  whatsappRemindersEnabled: boolean;
};

const SELECT_COLUMNS =
  "id, birth_date, cpf, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, " +
  "emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, " +
  "legal_guardian_name, legal_guardian_cpf, legal_guardian_phone, legal_guardian_relationship, " +
  "insurance_provider, insurance_plan, insurance_card_number, clinical_history, whatsapp_reminders_enabled";

function fromRow(d: Record<string, any>): PatientProfile {
  return {
    id: d.id,
    birthDate: d.birth_date,
    cpf: d.cpf,
    addressStreet: d.address_street,
    addressNumber: d.address_number,
    addressComplement: d.address_complement,
    addressNeighborhood: d.address_neighborhood,
    addressCity: d.address_city,
    addressState: d.address_state,
    addressZip: d.address_zip,
    emergencyContactName: d.emergency_contact_name,
    emergencyContactPhone: d.emergency_contact_phone,
    emergencyContactRelationship: d.emergency_contact_relationship,
    legalGuardianName: d.legal_guardian_name,
    legalGuardianCpf: d.legal_guardian_cpf,
    legalGuardianPhone: d.legal_guardian_phone,
    legalGuardianRelationship: d.legal_guardian_relationship,
    insuranceProvider: d.insurance_provider,
    insurancePlan: d.insurance_plan,
    insuranceCardNumber: d.insurance_card_number,
    clinicalHistory: d.clinical_history,
    whatsappRemindersEnabled: d.whatsapp_reminders_enabled,
  };
}

export async function getPatientProfile(patientId: string): Promise<PatientProfile | null> {
  const { data, error } = await supabase.from("patient_profiles").select(SELECT_COLUMNS).eq("id", patientId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

/** Upserts the fields provided, leaving the rest untouched (partial fichas are expected — most
 *  fields are optional, e.g. "Responsável Legal"/"Convênio" only apply to some patients). */
export async function upsertPatientProfile(patientId: string, fields: Partial<Omit<PatientProfile, "id">>): Promise<void> {
  const row: Record<string, any> = { id: patientId, updated_at: new Date().toISOString() };
  if (fields.birthDate !== undefined) row.birth_date = fields.birthDate;
  if (fields.cpf !== undefined) row.cpf = fields.cpf;
  if (fields.addressStreet !== undefined) row.address_street = fields.addressStreet;
  if (fields.addressNumber !== undefined) row.address_number = fields.addressNumber;
  if (fields.addressComplement !== undefined) row.address_complement = fields.addressComplement;
  if (fields.addressNeighborhood !== undefined) row.address_neighborhood = fields.addressNeighborhood;
  if (fields.addressCity !== undefined) row.address_city = fields.addressCity;
  if (fields.addressState !== undefined) row.address_state = fields.addressState;
  if (fields.addressZip !== undefined) row.address_zip = fields.addressZip;
  if (fields.emergencyContactName !== undefined) row.emergency_contact_name = fields.emergencyContactName;
  if (fields.emergencyContactPhone !== undefined) row.emergency_contact_phone = fields.emergencyContactPhone;
  if (fields.emergencyContactRelationship !== undefined) row.emergency_contact_relationship = fields.emergencyContactRelationship;
  if (fields.legalGuardianName !== undefined) row.legal_guardian_name = fields.legalGuardianName;
  if (fields.legalGuardianCpf !== undefined) row.legal_guardian_cpf = fields.legalGuardianCpf;
  if (fields.legalGuardianPhone !== undefined) row.legal_guardian_phone = fields.legalGuardianPhone;
  if (fields.legalGuardianRelationship !== undefined) row.legal_guardian_relationship = fields.legalGuardianRelationship;
  if (fields.insuranceProvider !== undefined) row.insurance_provider = fields.insuranceProvider;
  if (fields.insurancePlan !== undefined) row.insurance_plan = fields.insurancePlan;
  if (fields.insuranceCardNumber !== undefined) row.insurance_card_number = fields.insuranceCardNumber;
  if (fields.clinicalHistory !== undefined) row.clinical_history = fields.clinicalHistory;
  if (fields.whatsappRemindersEnabled !== undefined) row.whatsapp_reminders_enabled = fields.whatsappRemindersEnabled;

  const { error } = await supabase.from("patient_profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

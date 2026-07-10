import { supabase } from "./supabase";
import type { Modality } from "./database.types";

export type ProfessionalLocation = {
  id: string;
  label: string;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  isPrimary: boolean;
};

export type ProfessionalService = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  modality: Modality | null;
  active: boolean;
};

function locationFromRow(d: any): ProfessionalLocation {
  return {
    id: d.id,
    label: d.label,
    addressStreet: d.address_street,
    addressNumber: d.address_number,
    addressComplement: d.address_complement,
    addressNeighborhood: d.address_neighborhood,
    addressCity: d.address_city,
    addressState: d.address_state,
    addressZip: d.address_zip,
    isPrimary: d.is_primary,
  };
}

function serviceFromRow(d: any): ProfessionalService {
  return { id: d.id, name: d.name, durationMinutes: d.duration_minutes, price: Number(d.price), modality: d.modality, active: d.active };
}

export async function listLocations(professionalId: string): Promise<ProfessionalLocation[]> {
  const { data, error } = await supabase
    .from("professional_locations")
    .select("id, label, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, is_primary")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(locationFromRow);
}

export async function createLocation(professionalId: string, fields: Omit<ProfessionalLocation, "id">): Promise<void> {
  const { error } = await supabase.from("professional_locations").insert({
    professional_id: professionalId,
    label: fields.label,
    address_street: fields.addressStreet || null,
    address_number: fields.addressNumber || null,
    address_complement: fields.addressComplement || null,
    address_neighborhood: fields.addressNeighborhood || null,
    address_city: fields.addressCity || null,
    address_state: fields.addressState || null,
    address_zip: fields.addressZip || null,
    is_primary: fields.isPrimary,
  });
  if (error) throw error;
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from("professional_locations").delete().eq("id", id);
  if (error) throw error;
}

export async function listServices(professionalId: string): Promise<ProfessionalService[]> {
  const { data, error } = await supabase
    .from("professional_services")
    .select("id, name, duration_minutes, price, modality, active")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(serviceFromRow);
}

export async function createService(professionalId: string, fields: Omit<ProfessionalService, "id">): Promise<void> {
  const { error } = await supabase.from("professional_services").insert({
    professional_id: professionalId,
    name: fields.name,
    duration_minutes: fields.durationMinutes,
    price: fields.price,
    modality: fields.modality,
    active: fields.active,
  });
  if (error) throw error;
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase.from("professional_services").delete().eq("id", id);
  if (error) throw error;
}

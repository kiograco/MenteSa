-- MindCare MVP fake seed data.
-- Run after applying migrations. This file uses only fictitious users and public test data.

-- The token columns (confirmation_token etc.) default to NULL, which GoTrue's Go driver can't
-- scan into its non-nullable string fields — every login attempt for a seeded user fails with
-- "Database error querying schema" ("converting NULL to string is unsupported") until these are
-- set to ''. Real signups never hit this because handle_new_user() always goes through GoTrue
-- first, which fills them in itself.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  email_change,
  phone_change,
  phone_change_token,
  reauthentication_token
) values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'paciente.demo@mindcare.test',
    crypt('MindCare123!', gen_salt('bf')),
    now(),
    '{"full_name":"Ana Demo Paciente","role":"patient"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fernanda.demo@mindcare.test',
    crypt('MindCare123!', gen_salt('bf')),
    now(),
    '{"full_name":"Dra. Fernanda Demo","role":"professional"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rafael.demo@mindcare.test',
    crypt('MindCare123!', gen_salt('bf')),
    now(),
    '{"full_name":"Dr. Rafael Demo","role":"professional"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-4000-8000-000000000900',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin.demo@mindcare.test',
    crypt('MindCare123!', gen_salt('bf')),
    now(),
    '{"full_name":"Admin Demo","role":"admin"}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  )
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  raw_user_meta_data = excluded.raw_user_meta_data,
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change_token_current = '',
  email_change = '',
  phone_change = '',
  phone_change_token = '',
  reauthentication_token = '',
  updated_at = now();

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '{"sub":"00000000-0000-4000-8000-000000000001","email":"paciente.demo@mindcare.test"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101',
    '{"sub":"00000000-0000-4000-8000-000000000101","email":"fernanda.demo@mindcare.test"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000102',
    '{"sub":"00000000-0000-4000-8000-000000000102","email":"rafael.demo@mindcare.test"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000900',
    '00000000-0000-4000-8000-000000000900',
    '00000000-0000-4000-8000-000000000900',
    '{"sub":"00000000-0000-4000-8000-000000000900","email":"admin.demo@mindcare.test"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider, provider_id) do update set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.profiles (id, full_name, role, phone, avatar_url)
values
  ('00000000-0000-4000-8000-000000000001', 'Ana Demo Paciente', 'patient', '+55 11 90000-0001', null),
  ('00000000-0000-4000-8000-000000000101', 'Dra. Fernanda Demo', 'professional', '+55 11 90000-0101', 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&h=200&fit=crop&auto=format'),
  ('00000000-0000-4000-8000-000000000102', 'Dr. Rafael Demo', 'professional', '+55 21 90000-0102', 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&h=200&fit=crop&auto=format'),
  ('00000000-0000-4000-8000-000000000900', 'Admin Demo', 'admin', '+55 11 90000-0900', null)
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  phone = excluded.phone,
  avatar_url = excluded.avatar_url;

insert into public.professional_profiles (
  id,
  bio,
  specialties,
  approaches,
  license_type,
  license_number,
  verification_status,
  session_price,
  modalities,
  city,
  state,
  insurances,
  years_experience
) values
  (
    '00000000-0000-4000-8000-000000000101',
    'Psicologa clinica ficticia para validacao do MVP.',
    array['Ansiedade', 'Depressao', 'TCC'],
    array['TCC', 'ACT'],
    'CRP',
    '06/00001',
    'verified',
    180.00,
    array['online', 'presencial']::public.modality[],
    'Sao Paulo',
    'SP',
    array['Particular', 'Unimed'],
    8
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'Psiquiatra ficticio para validacao do MVP.',
    array['TDAH', 'Transtorno Bipolar'],
    array['Farmacoterapia', 'Psicoeducacao'],
    'CRM',
    '35/00002',
    'verified',
    350.00,
    array['online']::public.modality[],
    'Rio de Janeiro',
    'RJ',
    array['Particular'],
    12
  )
on conflict (id) do update set
  bio = excluded.bio,
  specialties = excluded.specialties,
  approaches = excluded.approaches,
  license_type = excluded.license_type,
  license_number = excluded.license_number,
  verification_status = excluded.verification_status,
  session_price = excluded.session_price,
  modalities = excluded.modalities,
  city = excluded.city,
  state = excluded.state,
  insurances = excluded.insurances,
  years_experience = excluded.years_experience;

insert into public.professional_availability (id, professional_id, weekday, start_time, end_time)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 1, '09:00', '12:00'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 3, '14:00', '18:00'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102', 2, '10:00', '13:00')
on conflict (id) do update set
  professional_id = excluded.professional_id,
  weekday = excluded.weekday,
  start_time = excluded.start_time,
  end_time = excluded.end_time;

insert into public.appointments (
  id,
  patient_id,
  professional_id,
  scheduled_at,
  duration_minutes,
  modality,
  status,
  price
) values (
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  now() + interval '1 day',
  50,
  'online',
  'scheduled',
  180.00
)
on conflict (id) do update set
  scheduled_at = excluded.scheduled_at,
  status = excluded.status,
  price = excluded.price;

insert into public.payments (id, appointment_id, status, method, amount, platform_fee, provider)
values (
  '00000000-0000-4000-8000-000000001101',
  '00000000-0000-4000-8000-000000001001',
  'paid',
  'pix',
  180.00,
  18.00,
  'mock'
)
on conflict (id) do update set
  appointment_id = excluded.appointment_id,
  status = excluded.status,
  method = excluded.method,
  amount = excluded.amount,
  platform_fee = excluded.platform_fee,
  provider = excluded.provider;

insert into public.video_rooms (appointment_id, room_url, provider_room_id)
values (
  '00000000-0000-4000-8000-000000001001',
  'https://meet.example.test/mindcare-demo',
  'demo-room-001'
)
on conflict (appointment_id) do update set
  room_url = excluded.room_url,
  provider_room_id = excluded.provider_room_id;

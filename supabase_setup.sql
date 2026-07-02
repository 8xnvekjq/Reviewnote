-- 1. 사용자 프로필 테이블 생성 (암호화된 API Key 동기화용)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  encrypted_api_key text,
  updated_at timestamp with time zone default now()
);

-- 2. 오답노트 테이블 생성
create table public.mistakes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  image_url text not null,
  analysis jsonb, -- {solvingProcess, mistakeDetail, rootCause, actionPlan}
  date timestamp with time zone default now() not null
);

-- RLS (Row Level Security) 설정 - 사용자는 자신의 데이터만 읽고 쓸 수 있도록 제어
alter table public.profiles enable row level security;
alter table public.mistakes enable row level security;

-- 프로필 테이블에 대한 RLS 정책 (조회, 삽입, 수정 분리)
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 오답노트 테이블에 대한 RLS 정책 (조회, 삽입, 삭제, 수정)
create policy "Users can view their own mistakes" on public.mistakes
  for select using (auth.uid() = user_id);

create policy "Users can insert their own mistakes" on public.mistakes
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own mistakes" on public.mistakes
  for delete using (auth.uid() = user_id);

create policy "Users can update their own mistakes" on public.mistakes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 신규 가입 시 프로필 테이블 자동 생성 트리거
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

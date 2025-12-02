-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends auth.users)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  avatar_url text,
  updated_at timestamp with time zone,
  
  constraint username_length check (char_length(username) >= 3)
);

-- Games table
create table games (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  status text check (status in ('waiting', 'playing', 'finished')) default 'waiting',
  
  -- Game State
  deck jsonb default '[]'::jsonb,
  discard_pile jsonb default '[]'::jsonb,
  current_turn_player_id uuid references auth.users,
  turn_phase text default 'draw',
  drawn_card jsonb,
  
  -- Players Data (JSONB map keyed by user_id)
  -- Structure: { [user_id]: { hand: Card[], is_ready: boolean, has_called_reds: boolean } }
  players jsonb default '{}'::jsonb,
  
  last_action_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS Policies
alter table profiles enable row level security;
alter table games enable row level security;

-- Profiles policies
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- Games policies
create policy "Games are viewable by everyone (for lobby)."
  on games for select
  using ( true );

create policy "Authenticated users can create games."
  on games for insert
  with check ( auth.role() = 'authenticated' );

create policy "Players can update games they are in."
  on games for update
  using ( 
    auth.uid()::text = any(select jsonb_object_keys(players)) 
    or 
    status = 'waiting' -- Allow joining
  );

-- Realtime
alter publication supabase_realtime add table games;

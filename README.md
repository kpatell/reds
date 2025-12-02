# Reds 🃏

A strategic real-time multiplayer card game built with React, TypeScript, and Supabase.

## Overview
Reds is a web-based implementation of a popular card game (similar to Golf or Cabo). Players compete to lower their hand value through drawing, swapping, and using special power cards. The game features real-time multiplayer interactions, including a unique "Stacking" mechanic that allows out-of-turn plays.

## Tech Stack
*   **Frontend:** React (Vite), TypeScript, TailwindCSS
*   **State Management:** Zustand (Client), React Query (Server)
*   **Backend:** Supabase (PostgreSQL, Auth, Realtime)
*   **Icons:** Lucide React

## Features
*   **Real-time Multiplayer:** Play against opponents instantly using Supabase Realtime.
*   **Anonymous Auth:** Jump straight into the game without signing up.
*   **Lobby System:** Create or join games seamlessly.
*   **Responsive Design:** Optimized for both desktop and mobile play.

## Getting Started

### Prerequisites
*   Node.js (v18+)
*   npm or pnpm
*   Supabase Project

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/reds.git
    cd reds
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file based on `.env.example`:
    ```bash
    cp .env.example .env
    ```
    Fill in your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Database Setup:**
    Run the SQL scripts in `supabase/schema.sql` in your Supabase SQL Editor to set up tables and policies.

5.  **Run Development Server:**
    ```bash
    npm run dev
    ```

## Project Structure
*   `src/components`: Reusable UI components.
*   `src/pages`: Route components (Lobby, Game).
*   `src/lib`: Supabase client and utilities.
*   `src/types`: TypeScript definitions (including Supabase generated types).

## Contributing
Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License
MIT

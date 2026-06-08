import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),

  // ID numerik auto-increment (selaras ER PRD §6) — bukan string UUID.
  advanced: {
    database: {
      generateId: "serial",
    },
  },

  emailAndPassword: {
    enabled: true,
    // Lapangan tanpa email asli; verifikasi email tidak diwajibkan.
    requireEmailVerification: false,
  },

  user: {
    // Core field `name` dipetakan ke kolom PRD `nama`.
    fields: {
      name: "nama",
    },
    // Field domain PRD pada user (role_id, cabang_id) sebagai additional fields.
    additionalFields: {
      roleId: { type: "number", required: true, input: true },
      cabangId: { type: "number", required: true, input: true },
    },
  },

  // nextCookies WAJIB plugin terakhir agar Set-Cookie ter-handle di server actions.
  plugins: [nextCookies()],
});

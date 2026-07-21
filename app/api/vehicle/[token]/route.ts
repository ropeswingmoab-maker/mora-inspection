import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data, error } = await supabaseAdmin().from("vehicles").select("id,name,unit_number").eq("qr_token", token).eq("active", true).single();
  if (error || !data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  return NextResponse.json({ vehicle: data });
}

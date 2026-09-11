"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CustomerStatus } from "@/lib/types";

export async function updateCustomerStatus(
  id: string,
  status: CustomerStatus
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
  return {};
}

export async function updateCustomerMemo(
  id: string,
  memo: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ memo }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/customers/${id}`);
  return {};
}

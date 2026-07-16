'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Clinic } from '@/lib/types';

async function requireClinic(slug: string): Promise<Clinic> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: clinic } = await supabase.from('clinics').select('*').eq('slug', slug).maybeSingle();
  if (!clinic) throw new Error('Clinic not found');
  return clinic as Clinic;
}

const spamSchema = z.object({
  slug: z.string(),
  callId: z.string().uuid(),
  blockNumber: z.boolean(),
});

export async function markCallAsSpam(input: z.infer<typeof spamSchema>): Promise<{ ok?: boolean; error?: string }> {
  const parsed = spamSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input' };
  const { slug, callId, blockNumber } = parsed.data;

  try {
    const clinic = await requireClinic(slug);
    const supabase = createClient();

    const { data: call } = await supabase
      .from('calls')
      .select('id, from_number')
      .eq('id', callId)
      .eq('clinic_id', clinic.id)
      .maybeSingle();
    if (!call) return { error: 'Call not found' };

    const { error } = await supabase
      .from('calls')
      .update({ spam_score: 1 })
      .eq('id', callId)
      .eq('clinic_id', clinic.id);
    if (error) return { error: error.message };

    if (blockNumber && call.from_number) {
      const { error: blockError } = await supabase.from('blocked_numbers').insert({
        clinic_id: clinic.id,
        number: call.from_number,
        reason: 'Marked as spam from dashboard',
      });
      // 23505 = already blocked; not an error
      if (blockError && blockError.code !== '23505') return { error: blockError.message };
    }

    revalidatePath(`/${slug}/calls/${callId}`);
    revalidatePath(`/${slug}/calls`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to mark as spam' };
  }
}

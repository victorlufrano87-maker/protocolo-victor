import { supabase } from "@/lib/supabase";

export const PHOTO_TYPES = [["rosto", "Rosto"], ["corpo", "Corpo (frente)"]];

// reduz para no máx. 1080 px e JPEG 82% (economiza espaço e envia rápido)
export async function compress(file, max = 1080) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}

export async function listDaily(uid, type, from, to) {
  let q = supabase.from("photos").select("*").eq("user_id", uid).like("path", `${uid}/daily/%-${type}-%`).order("day");
  if (from) q = q.gte("day", from);
  if (to) q = q.lte("day", to);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return [];
  const { data: urls, error: urlError } = await supabase.storage.from("fotos").createSignedUrls(data.map((x) => x.path), 3600);
  if (urlError) throw urlError;
  return data.map((x, i) => ({ ...x, url: urls?.[i]?.signedUrl }));
}

export async function saveDaily(uid, day, type, file) {
  const blob = await compress(file);
  if (!blob) throw new Error("Não consegui preparar a foto.");
  const path = `${uid}/daily/${day}-${type}-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  // Metadata changes are atomic; a failure leaves the previous photo intact.
  const { data: old, error: replaceError } = await supabase.rpc("replace_daily_photo", { p_day: day, p_type: type, p_path: path });
  // An interrupted response may have committed. Never delete the new object here.
  if (replaceError) throw replaceError;
  if (old?.length) await supabase.storage.from("fotos").remove(old);
}

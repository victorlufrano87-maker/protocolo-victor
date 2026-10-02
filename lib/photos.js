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
  const { data } = await q;
  if (!data?.length) return [];
  const { data: urls } = await supabase.storage.from("fotos").createSignedUrls(data.map((x) => x.path), 3600);
  return data.map((x, i) => ({ ...x, url: urls?.[i]?.signedUrl }));
}

export async function saveDaily(uid, day, type, file) {
  const blob = await compress(file);
  const path = `${uid}/daily/${day}-${type}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  // substitui a foto do mesmo tipo no mesmo dia
  const { data: old } = await supabase.from("photos").select("id, path").eq("user_id", uid).eq("day", day).like("path", `${uid}/daily/${day}-${type}-%`);
  if (old?.length) {
    await supabase.storage.from("fotos").remove(old.map((o) => o.path));
    await supabase.from("photos").delete().in("id", old.map((o) => o.id));
  }
  await supabase.from("photos").insert({ user_id: uid, day, path });
}

import { escapeHtml } from "../core.js?v=36";

export const localDateTime = (value) => value
  ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  : "";

export const resultTime = (milliseconds) => {
  if (milliseconds === null || milliseconds === undefined) return "—";
  const total=Math.floor(Number(milliseconds)/1000);
  const hours=Math.floor(total/3600);
  const minutes=Math.floor((total%3600)/60);
  const seconds=total%60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1,"0")}:${String(seconds).padStart(2,"0")}`;
};

export const parseResultTime = (value) => {
  const clean=String(value || "").trim();
  if(!clean) return null;
  if(/^\d+$/.test(clean)) return Number(clean)*1000;
  const parts=clean.split(":").map(Number);
  if(parts.some(Number.isNaN) || parts.length<2 || parts.length>3) throw new Error(`Invalid time: ${clean}`);
  return (parts.length===3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+parts[1])*1000;
};

export const ordinal = (value) => {
  const suffixes=["th","st","nd","rd"];
  const remainder=value%100;
  return `${value}${suffixes[(remainder-20)%10]||suffixes[remainder]||suffixes[0]}`;
};

export const safeColor = (value) => /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#0f6b4f";

export const safeUrl = (value) => {
  try {
    const url=new URL(value);
    return ["http:","https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

export const contentHtml = (value) => escapeHtml(value || "").replace(/\n/g,"<br>");

export function setPageMetadata(
  title="OpenStart — Open-source race registration",
  description="Great race days start in the open.",
  image="og.png",
) {
  document.title=title;
  document.querySelector('meta[name="description"]')?.setAttribute("content",description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content",title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content",description);
  document.querySelector('meta[property="og:image"]')?.setAttribute("content",image);
}

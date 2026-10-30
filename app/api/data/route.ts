// 선택 기능: Upstash Redis(Vercel Marketplace)로 두 사람이 여러 기기에서 같은 가계부를 공유
export const dynamic = "force-dynamic";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PASS = process.env.APP_PASSCODE;
const KEY = "household-finance:data";

async function redis(cmd: unknown[]) {
  const r = await fetch(URL_!, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()) as { result: unknown };
}

function guard(req: Request) {
  if (!URL_ || !TOKEN || !PASS) return Response.json({ error: "cloud sync not configured" }, { status: 501 });
  if (req.headers.get("x-passcode") !== PASS) return Response.json({ error: "wrong passcode" }, { status: 401 });
  return null;
}

export async function GET(req: Request) {
  const bad = guard(req);
  if (bad) return bad;
  const { result } = await redis(["GET", KEY]);
  return Response.json({ data: typeof result === "string" ? JSON.parse(result) : null });
}

export async function PUT(req: Request) {
  const bad = guard(req);
  if (bad) return bad;
  const body = await req.text();
  if (body.length > 900_000) return Response.json({ error: "too large" }, { status: 413 });
  JSON.parse(body); // 형식 검증
  await redis(["SET", KEY, body]);
  return Response.json({ ok: true });
}

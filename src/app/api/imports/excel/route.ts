import { POST as handlePost } from "@/app/api/imports/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handlePost(request);
}

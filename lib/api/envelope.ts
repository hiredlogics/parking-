import { NextResponse } from "next/server";

/**
 * Consistent API envelope (brief §28).
 *
 *   success: { success: true, data: {...} }
 *   error:   { success: false, error: { code, message } }
 */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

/** Map a service-layer access failure onto an HTTP response. */
export function failFromAccess(f: {
  status: number;
  code: string;
  message: string;
}) {
  return fail(f.code, f.message, f.status);
}

/** Parse a JSON body, returning null when malformed. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

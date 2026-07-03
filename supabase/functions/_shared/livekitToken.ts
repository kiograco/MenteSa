// Hand-rolled LiveKit access token (JWT, HS256) — avoids pulling in the Node-oriented
// livekit-server-sdk (and its dependency chain) into the Deno edge runtime for something that's
// just a signed JSON payload. Token format: https://docs.livekit.io/home/get-started/authentication/
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type VideoGrant = {
  room: string;
  roomJoin: true;
  roomCreate: true;
  canPublish: boolean;
  canSubscribe: boolean;
};

export async function createLiveKitToken(opts: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name: string;
  room: string;
  ttlSeconds: number;
}): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const grant: VideoGrant = {
    room: opts.room,
    roomJoin: true,
    roomCreate: true,
    canPublish: true,
    canSubscribe: true,
  };

  const payload = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.name,
    nbf: now - 10,
    exp: now + opts.ttlSeconds,
    video: grant,
  };

  const encoder = new TextEncoder();
  const encodedHeader = base64url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(opts.apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));

  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

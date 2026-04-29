import https from "node:https";

export interface HttpsResponse {
  statusCode: number;
  body: string;
}

export type HttpsGet = (url: string, headers: Record<string, string>) => Promise<HttpsResponse>;

export interface FetchRemoteShaInput {
  owner: string;
  repo: string;
  branch: string;
  httpsGet?: HttpsGet;
  userAgent?: string;
}

export async function fetchRemoteSha(input: FetchRemoteShaInput): Promise<string | null> {
  const get = input.httpsGet ?? defaultHttpsGet;
  const url = `https://api.github.com/repos/${input.owner}/${input.repo}/branches/${input.branch}`;
  const headers = {
    "User-Agent": input.userAgent ?? "teamagent-updater",
    "Accept": "application/vnd.github+json",
  };
  try {
    const res = await get(url, headers);
    if (res.statusCode !== 200) return null;
    const obj = JSON.parse(res.body) as { commit?: { sha?: string } };
    return obj.commit?.sha ?? null;
  } catch {
    return null;
  }
}

const defaultHttpsGet: HttpsGet = (url, headers) =>
  new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 10_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => resolve({
        statusCode: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf-8"),
      }));
      res.on("error", reject);
    });
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
  });

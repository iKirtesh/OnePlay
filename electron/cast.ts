import dgram from "node:dgram";

/** Casting to DLNA/UPnP smart TVs and speakers: find renderers on the network, hand them a URL, and control playback. */
export type CastDevice = { name: string; control: string; location: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`, "i").exec(xml)?.[1]?.trim() ?? "";

export function discover(timeoutMs = 3500): Promise<CastDevice[]> {
  return new Promise((resolve) => {
    const found = new Map<string, string>();
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const finish = async () => {
      try { sock.close(); } catch { /* already closed */ }
      const out: CastDevice[] = [];
      await Promise.all([...found.values()].map(async (location) => {
        try {
          const xml = await (await fetch(location, { signal: AbortSignal.timeout(2500) })).text();
          const svc = /<service>[\s\S]*?urn:schemas-upnp-org:service:AVTransport:1[\s\S]*?<\/service>/i.exec(xml)?.[0];
          const ctl = svc ? tag(svc, "controlURL") : "";
          if (!ctl) return;
          out.push({ name: tag(xml, "friendlyName") || "TV", control: new URL(ctl, tag(xml, "URLBase") || location).toString(), location });
        } catch { /* device did not answer */ }
      }));
      resolve(out.sort((a, b) => a.name.localeCompare(b.name)));
    };
    sock.on("message", (m) => { const loc = /^location:\s*(.+)$/im.exec(m.toString())?.[1]?.trim(); if (loc) found.set(loc, loc); });
    sock.on("error", () => { void finish(); });
    sock.bind(0, () => {
      const msg = Buffer.from(["M-SEARCH * HTTP/1.1", "HOST: 239.255.255.250:1900", 'MAN: "ssdp:discover"', "MX: 2", "ST: urn:schemas-upnp-org:device:MediaRenderer:1", "", ""].join("\r\n"));
      for (let i = 0; i < 2; i++) setTimeout(() => { try { sock.send(msg, 1900, "239.255.255.250"); } catch { /* no network */ } }, i * 400);
      setTimeout(() => { void finish(); }, timeoutMs);
    });
  });
}

async function soap(control: string, action: string, args: string): Promise<void> {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID>${args}</u:${action}></s:Body></s:Envelope>`;
  const res = await fetch(control, { method: "POST", signal: AbortSignal.timeout(8000), headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPACTION: `"urn:schemas-upnp-org:service:AVTransport:1#${action}"` }, body });
  if (!res.ok) throw new Error(`The TV refused (${res.status}). It may not support this format.`);
}

export async function castTo(control: string, url: string, title: string, mime: string): Promise<void> {
  const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="0" restricted="1"><dc:title>${esc(title)}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:${mime}:*">${esc(url)}</res></item></DIDL-Lite>`;
  await soap(control, "SetAVTransportURI", `<CurrentURI>${esc(url)}</CurrentURI><CurrentURIMetaData>${esc(didl)}</CurrentURIMetaData>`);
  await soap(control, "Play", "<Speed>1</Speed>");
}
export const castStop = (control: string) => soap(control, "Stop", "");
export const castPause = (control: string) => soap(control, "Pause", "");
export const castResume = (control: string) => soap(control, "Play", "<Speed>1</Speed>");

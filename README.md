<p align="center">
  <img src="assets/cover.svg" alt="ip.jaba.ge: what's my IP" width="100%">
</p>

A "what's my IP" page at [ip.jaba.ge](https://ip.jaba.ge). Open it in a browser
and it shows your public IP address in big type, with a copy button. Under
"More info" you get the location, network (ASN and provider), timezone,
reverse DNS hostname, the Cloudflare data center you hit, and the HTTP and TLS
versions of the connection.

It runs as a single Cloudflare Worker. All the data comes from the request
itself (the `CF-Connecting-IP` header and Cloudflare's `request.cf` object), so
there's no GeoIP database to keep updated and no third-party API. The only
outbound call is a PTR lookup over Cloudflare's DNS-over-HTTPS, with an 800 ms
timeout.

The footer links to [speed.jaba.ge](https://speed.jaba.ge) for a speed test,
and the speed test links back here.

## From a terminal

curl, wget, HTTPie and PowerShell get plain text instead of the page:

```console
$ curl ip.jaba.ge
203.0.113.42

$ curl ip.jaba.ge/all

  ip.jaba.ge

  IP           203.0.113.42
  Version      IPv4
  Location     Tbilisi, Georgia
  Coordinates  41.6941, 44.8337
  Timezone     Asia/Tbilisi
  Network      AS64500 Example ISP
  Cloudflare   Tbilisi (TBS)
  Connection   HTTP/2, TLSv1.3, 12 ms RTT

  Speed test: curl https://speed.jaba.ge
```

| Path | Returns |
| --- | --- |
| `/` | the page in a browser, the bare IP for everything else |
| `/ip` | the bare IP, for any client |
| `/all` | every field as aligned text |
| `/json` | every field as JSON (CORS open, so other pages can fetch it) |
| `/country` `/city` `/region` `/postal` | one location field |
| `/loc` | `latitude,longitude` |
| `/tz` | IANA timezone |
| `/asn` `/org` | network number and name |
| `/hostname` | reverse DNS name, 404 if there is none |
| `/colo` `/ua` | Cloudflare data center code, your User-Agent |

A field that Cloudflare doesn't know comes back empty with a 404, which keeps
shell scripts simple:

```sh
country=$(curl -sf ip.jaba.ge/country) || country=unknown
```

The browser check looks at the `Accept` header. Anything that asks for
`text/html` gets the page, so `curl -H 'Accept: text/html' ip.jaba.ge` returns
HTML if you want it.

Plain `http://` works for terminals so `curl ip.jaba.ge` needs no `-L`.
Browsers on `http://` get redirected to HTTPS. For that to work the zone's
"Always Use HTTPS" setting has to leave this hostname alone; otherwise
Cloudflare sends the redirect before the Worker runs.

## Accuracy

Location is Cloudflare's estimate for your IP. It's usually right about the
country and often off by a city or more, especially on mobile networks and
VPNs. Coordinates point at the middle of that estimate, not at you.

## Layout

```
src/worker.js     routing, data collection, text and JSON output
src/page.html     the page (template; the Worker fills in the IP and data)
public/           font and favicon, served by Workers Assets
assets/           logo and cover for this README
```

The page uses Familjen Grotesk (OFL), self-hosted, the same font and layout as
speed.jaba.ge.

## Run locally

```bash
npm install
npm run dev
```

Local `request.cf` data is a placeholder from Wrangler, and the IP is
`127.0.0.1` unless you set it:

```bash
curl -H 'CF-Connecting-IP: 8.8.8.8' localhost:8787/all
```

## Deploy

```bash
npm run deploy
```

`wrangler.toml` attaches `ip.jaba.ge` as a custom domain, so Wrangler creates
the DNS record and certificate on the `jaba.ge` zone. Change the `routes`
pattern to host it on your own domain.

## Privacy

Nothing is stored. The Worker has no database, KV or logging bindings, and the
page sets no cookies and loads nothing from other domains.

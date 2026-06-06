export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const num = String(req.query.num || '').replace(/\D/g, '').slice(-10);
  if (num.length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
  }

  const upstream = 'https://anon-num-info.vercel.app/num?key=305temp&num=' + encodeURIComponent(num);
  try {
    const r = await fetch(upstream, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: 'Upstream Aadhar API unreachable', detail: String(e.message || e) });
  }
}

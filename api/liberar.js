// Confere o código de acesso no servidor (Vercel).
// Os códigos ficam na variável de ambiente ACCESS_CODES, separados por vírgula.
module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const validos = (process.env.ACCESS_CODES || '')
    .split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  const codigo = String((req.body && req.body.codigo) || '').trim().toUpperCase();
  if (codigo && validos.includes(codigo)) return res.status(200).json({ ok: true });
  res.status(401).json({ ok: false, erro: 'Código inválido' });
};

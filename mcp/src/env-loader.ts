// Must be imported before any module that reads process.env at load time.
const raw = process.env.ADDITIONAL_ENVIRONMENT_VARIABLES;

if (raw && raw.trim() && !raw.includes("${user_config.")) {
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    const key = eq > 0 ? line.slice(0, eq).trim() : "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      console.error(`[WARN] Ignoring invalid additional environment variable line: "${line}"`);
      continue;
    }

    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1).trim();
    }

    process.env[key] = value;
    console.error(`[OK] Additional environment variable ${key} applied`);
  }
}

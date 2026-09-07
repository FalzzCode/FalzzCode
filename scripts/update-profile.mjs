import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const owner = "FalzzCode";
const profileRepository = owner;
const root = new URL("../", import.meta.url);
const token = process.env.GITHUB_TOKEN;
const apiHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "FalzzCode-profile-data-sync",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const languageColors = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  PHP: "#777bb4",
  CSS: "#563d7c",
  HTML: "#e34c26",
  PLpgSQL: "#336791",
  Python: "#3572a5",
  Java: "#b07219",
  Go: "#00add8",
  Rust: "#dea584",
  Lua: "#000080",
};

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers: apiHeaders });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json();
}

function escapeCell(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, " ");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatPercent(value) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function languageColor(language) {
  return languageColors[language] ?? "#94a3b8";
}

function languageSvg(languages) {
  const width = 880;
  const barX = 24;
  const barWidth = width - 48;
  const barY = 58;
  const rowStart = 104;
  const rowHeight = 30;
  const height = rowStart + languages.length * rowHeight + 22;
  const total = languages.reduce((sum, language) => sum + language.bytes, 0) || 1;
  let barOffset = barX;

  const bar = languages.map((language) => {
    const segmentWidth = barWidth * (language.bytes / total);
    const segment = `<rect x="${barOffset.toFixed(2)}" y="${barY}" width="${Math.max(segmentWidth, 1).toFixed(2)}" height="14" fill="${languageColor(language.name)}" />`;
    barOffset += segmentWidth;
    return segment;
  }).join("");

  const rows = languages.map((language, index) => {
    const y = rowStart + index * rowHeight;
    return [
      `<circle cx="30" cy="${y - 5}" r="5" fill="${languageColor(language.name)}" />`,
      `<text x="46" y="${y}" class="label">${escapeXml(language.name)}</text>`,
      `<text x="${width - 24}" y="${y}" text-anchor="end" class="value">${formatPercent(language.percent)}</text>`,
    ].join("");
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Languages used across public repositories</title>
  <desc id="desc">${languages.length} languages detected from the public repositories of ${owner}.</desc>
  <style>
    .card { fill: #ffffff; stroke: #e2e8f0; }
    .title { fill: #0f172a; font: 700 19px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .subtitle, .label, .value { fill: #64748b; font: 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .value { font-variant-numeric: tabular-nums; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #161b22; stroke: #30363d; }
      .title { fill: #f0f6fc; }
      .subtitle, .label, .value { fill: #8b949e; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" />
  <text x="24" y="29" class="title">${languages.length} Languages</text>
  <text x="24" y="47" class="subtitle">Most used languages</text>
  <clipPath id="language-bar-clip"><rect x="${barX}" y="${barY}" width="${barWidth}" height="14" rx="7" /></clipPath>
  <g clip-path="url(#language-bar-clip)">${bar}</g>
  ${rows}
</svg>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function repositoriesTable(repositories) {
  const rows = repositories.map((repository) => {
    const description = repository.description || "—";
    const primaryLanguage = repository.language || "—";
    return `| [${escapeCell(repository.name)}](https://github.com/${owner}/${repository.name}) | ${escapeCell(primaryLanguage)} | ${repository.stargazers_count} | ${formatDate(repository.updated_at)} | ${escapeCell(description)} |`;
  });

  return [
    "## Repositories",
    "",
    "| Repository | Primary language | Stars | Updated | Description |",
    "| --- | --- | ---: | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function statsTable(repositories, profile) {
  const stars = repositories.reduce((sum, repository) => sum + repository.stargazers_count, 0);
  return [
    "## Account data",
    "",
    `| Public code repos | Stars | Followers | Following |`,
    "| ---: | ---: | ---: | ---: |",
    `| ${repositories.length} | ${stars} | ${profile.followers} | ${profile.following} |`,
    "",
  ].join("\n");
}

async function main() {
  const [profile, allRepositories] = await Promise.all([
    github(`/users/${owner}`),
    github(`/users/${owner}/repos?per_page=100&sort=updated`),
  ]);
  const repositories = allRepositories.filter((repository) => (
    !repository.private && repository.name !== profileRepository
  ));
  const languagesByName = new Map();

  for (const repository of repositories) {
    const languages = await github(`/repos/${owner}/${repository.name}/languages`);
    for (const [name, bytes] of Object.entries(languages)) {
      languagesByName.set(name, (languagesByName.get(name) ?? 0) + bytes);
    }
  }

  const totalBytes = [...languagesByName.values()].reduce((sum, bytes) => sum + bytes, 0) || 1;
  const languages = [...languagesByName.entries()]
    .sort(([, left], [, right]) => right - left)
    .map(([name, bytes]) => ({ name, bytes, percent: (bytes / totalBytes) * 100 }));

  const readme = [
    "<!-- Generated from the public GitHub API by scripts/update-profile.mjs. -->",
    '<div align="center">',
    "  <h1>FallAbigail</h1>",
    '  <p><a href="https://github.com/FalzzCode">@FalzzCode</a></p>',
    "</div>",
    "",
    repositoriesTable(repositories),
    "## Languages",
    "",
    '<img src="./assets/languages.svg" alt="Languages used across public repositories" />',
    "",
    statsTable(repositories, profile),
    '<p align="center"><a href="https://github.com/FalzzCode?tab=repositories">View all repositories →</a></p>',
    "",
  ].join("\n");

  const assetsDirectory = new URL("./assets/", root);
  await mkdir(assetsDirectory, { recursive: true });
  await writeFile(new URL("./README.md", root), readme, "utf8");
  await writeFile(new URL("./assets/languages.svg", root), languageSvg(languages), "utf8");
  console.log(`Updated ${repositories.length} repositories and ${languages.length} languages.`);
}

await main();

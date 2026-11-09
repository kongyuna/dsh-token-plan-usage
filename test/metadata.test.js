import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJSON(url) {
	return JSON.parse(await readFile(url, "utf8"));
}

test("package publishes the bundle, client, locale and icon surfaces", async () => {
	const manifest = await readJSON(new URL("../package.json", import.meta.url));
	assert.equal(manifest.name, "dsh-token-plan-usage");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.type, "module");
	assert.equal(manifest.main, "lib/index.js");
	assert.equal(manifest.exports["./client"], "./lib/client.js");
	assert.equal(manifest.exports["./locale/*.json"], "./locale/*.json");
	assert.equal(manifest.exports["./icon"], "./icon.svg");
	assert.equal(manifest.icon, "icon.svg");
	assert.deepEqual(manifest.files.filter((file) => file.startsWith("lib")), ["lib"]);
	assert.ok(manifest.files.includes("locale/*.json"));
	assert.ok(manifest.files.includes("icon.svg"));
	assert.ok(manifest.files.includes("cordis.patch.yml"));
	assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
	assert.equal(manifest.dsh.client.platform, "web");
	assert.equal(manifest.dsh.client.immediately, true);
	for (const injected of [
		"@deepseek-ai/dsh-client-locale",
		"@deepseek-ai/dsh-client-ui-slots",
		"@deepseek-ai/dsh-client-ui-sidebar"
	]) {
		assert.ok(manifest.dsh.client.inject.includes(injected), injected);
	}
});

test("engines admit the current DSH 0.2 line and stop before 0.3", async () => {
	const manifest = await readJSON(new URL("../package.json", import.meta.url));
	assert.equal(manifest.engines.node, ">=22.19.0");
	assert.equal(manifest.engines.dsh, ">=0.2.1-rc.2 <0.3.0-0");
	assert.equal(manifest.license, "MIT");
	assert.match(manifest.repository, /kongyuna\/dsh-token-plan-usage/);
	assert.equal(manifest.private, true);
});

test("plugin manager metadata exists in both locales", async () => {
	for (const locale of ["zh", "en"]) {
		const dictionary = await readJSON(new URL(`../locale/${locale}.json`, import.meta.url));
		assert.equal(typeof dictionary.meta.title, "string");
		assert.ok(dictionary.meta.title.length > 0);
		assert.equal(typeof dictionary.meta.description, "string");
		assert.ok(dictionary.meta.description.length > 20);
	}
});

test("the icon is a small, valid SVG", async () => {
	const icon = await readFile(new URL("../icon.svg", import.meta.url), "utf8");
	assert.match(icon.trim(), /^<svg\b/);
	assert.ok(Buffer.byteLength(icon, "utf8") <= 256 * 1024);
	assert.match(icon, /viewBox="0 0 64 64"/);
});

test("the bundle patch inserts exactly this plugin", async () => {
	const patch = await readFile(new URL("../cordis.patch.yml", import.meta.url), "utf8");
	assert.match(patch, /insert:/);
	assert.match(patch, /id: dsh-token-plan-usage/);
	assert.match(patch, /name: dsh-token-plan-usage/);
});

test("READMEs document install, config, security and the ring semantics", async () => {
	const zh = await readFile(new URL("../README.md", import.meta.url), "utf8");
	const en = await readFile(new URL("../README.en.md", import.meta.url), "utf8");
	for (const text of [zh, en]) {
		assert.match(text, /install|安装/i);
		assert.match(text, /OPENCODE_GO_API_KEY/);
		assert.match(text, /XIAOMI_TOKEN_PLAN_COOKIE/);
		assert.match(text, /Cookie|Cookie/i);
	}
	assert.match(zh, /弧长/);
	assert.match(zh, /剩余/);
	assert.match(zh, /MIT/);
});

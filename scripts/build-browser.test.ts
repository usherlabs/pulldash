import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

test("failed bundles exit unsuccessfully while watch mode survives build errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pulldash-build-"));
  try {
    await mkdir(join(directory, "src/browser"), { recursive: true });
    await mkdir(join(directory, "dist/browser"), { recursive: true });
    await Bun.write(join(directory, "src/browser/logo.svg"), "<svg />");
    await Bun.write(join(directory, "dist/browser/index.html"), "<html />");
    const preload = join(directory, "build-fixture.ts");
    await Bun.write(
      preload,
      `let calls = 0;
Bun.build = async () => ({ success: ++calls !== Number(process.env.FAIL_BUILD_AT), outputs: [], logs: [] });`
    );
    for (const failure of ["1", "2"]) {
      const child = Bun.spawn(
        [
          process.execPath,
          "--preload",
          preload,
          join(import.meta.dir, "build-browser.ts"),
        ],
        {
          cwd: directory,
          env: { ...process.env, FAIL_BUILD_AT: failure },
          stdout: "pipe",
          stderr: "pipe",
        }
      );
      const error = await new Response(child.stderr).text();
      expect(error).toContain(
        failure === "1" ? "Main build failed" : "Worker build failed"
      );
      expect(await child.exited).toBe(1);
    }
    await Bun.write(
      preload,
      'Bun.build = async () => { throw new Error("Fixture build failure"); };'
    );
    const watcher = Bun.spawn(
      [
        process.execPath,
        "--preload",
        preload,
        join(import.meta.dir, "build-browser.ts"),
        "--watch",
      ],
      { cwd: directory, stdout: "pipe", stderr: "pipe" }
    );
    const errors = new Response(watcher.stderr).text();
    let output = "";
    try {
      const reader = watcher.stdout.getReader();
      const decoder = new TextDecoder();
      while (!output.includes("Watching for changes")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output += decoder.decode(chunk.value);
      }
      expect(output).toContain("Watching for changes");
    } finally {
      watcher.kill();
      await watcher.exited;
      expect(await errors).toContain("Fixture build failure");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

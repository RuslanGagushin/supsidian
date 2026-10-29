// Card actions: create, parents, drag and drop, color and icon, rename, delete, undo, tasks, daily notes, settings.
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { openVault, ev, raw, fsText, settle } from "./harness.mjs";

const fmOf = (p) => ev((p) => vault.notes.get(p)?.fm ?? null, p);
const parentsOf = (p) => ev((p) => { graph = buildGraph(); return graph.parentsOf(p).sort(); }, p);
const NOTES = {
  "Cards/Home.md": "---\nicon: house\n---\nThe home card. See [[Garden]] and [[Cards/Garden|my garden]] and ![[Garden#Beds]].\n",
  "Cards/Garden.md": '---\nparents:\n  - "[[Home]]"\n---\nBeds and trees.\n- [ ] water\n- [x] plant\n```\n- [ ] not a task\n```\n- [ ] weed\n',
  "Cards/Shed.md": '---\nparents: ["[[Home]]"]\n---\nTools.\n',
  "Cards/Tools/Saw.md": '---\nparents: ["[[Shed]]"]\n---\n',
  "Templates/Plant.md": "---\nicon: sprout\ntags: [plant]\nchild_order: [\"[[x]]\"]\nparents: [\"[[Home]]\"]\nnote: \"{{title}} on {{date:YYYY}}\"\n---\n# {{title}}\nPlanted: {{date}}\n",
};

describe("create", () => {
  beforeEach(() => openVault({ demo: false, notes: NOTES }));

  test("a child card goes next to its parent and links it", async () => {
    const p = await ev(() => createCard("Roses", "Cards/Garden.md", "red ones"));
    assert.equal(p, "Cards/Roses.md");
    assert.equal(await raw(p), '---\nparents:\n  - "[[Garden]]"\n---\nred ones\n');
    assert.deepEqual(await parentsOf(p), ["Cards/Garden.md"]);
  });

  test("names stay unique and clean; empty titles get a name", async () => {
    assert.equal(await ev(() => createCard("garden", "Cards/Home.md")), "Cards/garden 1.md", "Cards/Garden.md exists: case-insensitive clash");
    assert.equal(await ev(() => createCard("a/b?", null)), "a b.md");
    assert.equal(await ev(() => createCard("   ", null)), "Untitled.md");
  });

  test("the cards folder setting wins over the parent's folder", async () => {
    await ev(() => { S.cardsFolder = "Inbox"; });
    assert.equal(await ev(() => createCard("New", "Cards/Garden.md")), "Inbox/New.md");
  });

  test("a child template fills the new card but not its structure keys", async () => {
    await ev(() => setChildTemplate("Cards/Garden.md", "Templates/Plant.md"));
    assert.equal((await fmOf("Cards/Garden.md")).child_template, "[[Plant]]");
    const p = await ev(() => createCard("Tulip", "Cards/Garden.md", "", undefined, { tags: ["spring"] }));
    const year = String(new Date().getFullYear());
    assert.deepEqual(await fmOf(p), { parents: ["[[Garden]]"], icon: "sprout", tags: ["plant", "spring"], note: `Tulip on ${year}` });
    assert.match(await raw(p), /\n---\n# Tulip\nPlanted: \d{4}-\d\d-\d\d\n$/);
  });

  test("the composer creates a card on Enter, the first line is the title", async () => {
    await ev(() => setTarget("Cards/Garden.md"));
    const page = (await import("./harness.mjs")).page;
    await page.fill(".sn-composer textarea", "Pond\nwith fish");
    await page.press(".sn-composer textarea", "Enter");
    await page.waitForFunction(() => vault.notes.has("Cards/Pond.md"));
    assert.equal(await raw("Cards/Pond.md"), '---\nparents:\n  - "[[Garden]]"\n---\nwith fish\n');
  });
});

describe("parents and moves", () => {
  beforeEach(() => openVault({ demo: false, notes: NOTES }));

  test("add and remove a parent; refuse cycles, self and duplicates", async () => {
    await ev(() => addParent("Cards/Shed.md", "Cards/Garden.md"));
    assert.deepEqual(await parentsOf("Cards/Shed.md"), ["Cards/Garden.md", "Cards/Home.md"]);
    const before = await raw("Cards/Home.md");
    await ev(() => addParent("Cards/Home.md", "Cards/Tools/Saw.md")); // Saw is under Home
    await ev(() => addParent("Cards/Home.md", "Cards/Home.md"));
    await ev(() => addParent("Cards/Shed.md", "Cards/Home.md"));
    assert.equal(await raw("Cards/Home.md"), before);
    assert.deepEqual(await parentsOf("Cards/Shed.md"), ["Cards/Garden.md", "Cards/Home.md"]);
    await ev(() => removeParent("Cards/Shed.md", "Cards/Home.md"));
    assert.deepEqual((await fmOf("Cards/Shed.md")).parents, ["[[Garden]]"]);
    await ev(() => removeParent("Cards/Shed.md", "Cards/Garden.md"));
    assert.equal((await fmOf("Cards/Shed.md")).parents, undefined, "the empty field is dropped");
  });

  test("drop: move, add a parent, take to the root", async () => {
    await ev(() => dropCards([{ child: "Cards/Tools/Saw.md", from: "Cards/Shed.md" }], "Cards/Garden.md", true));
    assert.deepEqual(await parentsOf("Cards/Tools/Saw.md"), ["Cards/Garden.md"]);
    await ev(() => dropCards([{ child: "Cards/Tools/Saw.md", from: "Cards/Garden.md" }], "Cards/Shed.md", false));
    assert.deepEqual(await parentsOf("Cards/Tools/Saw.md"), ["Cards/Garden.md", "Cards/Shed.md"]);
    await ev(() => dropCards([{ child: "Cards/Shed.md", from: "Cards/Home.md" }], null, true));
    assert.deepEqual(await parentsOf("Cards/Shed.md"), []);
  });

  test("drop refuses to nest a card in its own descendant", async () => {
    const before = await raw("Cards/Home.md");
    await ev(() => dropCards([{ child: "Cards/Home.md", from: null }], "Cards/Tools/Saw.md", true));
    assert.equal(await raw("Cards/Home.md"), before);
  });

  test("drop before a sibling writes child_order", async () => {
    await ev(() => dropCards([{ child: "Cards/Shed.md", from: "Cards/Home.md" }], "Cards/Home.md", true, { path: "Cards/Garden.md", pos: "before" }));
    assert.deepEqual((await fmOf("Cards/Home.md")).child_order, ["[[Shed]]", "[[Garden]]"]);
    assert.deepEqual(await ev(() => { graph = buildGraph(); return graph.sortedChildren("Cards/Home.md", manualCmp); }), ["Cards/Shed.md", "Cards/Garden.md"]);
  });

  test("drop at the root numbers the order field", async () => {
    await ev(() => dropCards([{ child: "Cards/Garden.md", from: "Cards/Home.md" }], null, true, { path: "Cards/Home.md", pos: "before" }));
    assert.equal((await fmOf("Cards/Garden.md")).order, 1);
    assert.equal((await fmOf("Cards/Home.md")).order, 2);
  });

  test("color and icon on several cards", async () => {
    await ev(() => setColor(["Cards/Home.md", "Cards/Shed.md"], "green"));
    assert.equal((await fmOf("Cards/Shed.md")).color, "green");
    assert.equal(await ev(() => cardColor("Cards/Home.md")), "green");
    await ev(() => setColor(["Cards/Home.md"], null));
    assert.equal((await fmOf("Cards/Home.md")).color, undefined);
    await ev(() => setIconFor(["Cards/Shed.md"], "hammer"));
    assert.equal(await ev(() => cardIcon("Cards/Shed.md")), "hammer");
  });

  test("a broken frontmatter is never overwritten", async () => {
    await ev(() => writeRaw("Cards/Bad.md", "---\na: [\n---\nkeep me\n"));
    await ev(() => setColor(["Cards/Bad.md"], "red"));
    assert.equal(await raw("Cards/Bad.md"), "---\na: [\n---\nkeep me\n");
  });
});

describe("rename", () => {
  beforeEach(() => openVault({ demo: false, notes: NOTES }));

  test("renames the file and every link to it, keeping aliases and headings", async () => {
    await ev(async () => { S.pinned = ["Cards/Garden.md"]; board.target = "Cards/Garden.md"; });
    const np = await ev(() => renameCard("Cards/Garden.md", "Yard"));
    assert.equal(np, "Cards/Yard.md");
    assert.equal(await raw("Cards/Home.md"), "---\nicon: house\n---\nThe home card. See [[Yard]] and [[Yard|my garden]] and ![[Yard#Beds]].\n");
    assert.equal(await fsText("Cards/Garden.md"), null);
    assert.match(await fsText("Cards/Yard.md"), /Beds and trees/);
    assert.deepEqual(await ev(() => [S.pinned, board.target]), [["Cards/Yard.md"], "Cards/Yard.md"]);
  });

  test("children keep their parent after it is renamed", async () => {
    await ev(() => renameCard("Cards/Shed.md", "Barn"));
    assert.deepEqual(await parentsOf("Cards/Tools/Saw.md"), ["Cards/Barn.md"]);
  });

  test("refuses a name that exists", async () => {
    assert.equal(await ev(() => renameCard("Cards/Shed.md", "garden")), "Cards/Shed.md");
    assert.notEqual(await raw("Cards/Shed.md"), null);
  });
});

describe("delete and undo", () => {
  beforeEach(() => openVault({ demo: false, notes: NOTES }));

  test("undo reverts a change, then nothing is left to undo", async () => {
    const before = await raw("Cards/Shed.md");
    await ev(() => setColor(["Cards/Shed.md"], "red"));
    await ev(() => undo());
    assert.equal(await raw("Cards/Shed.md"), before);
    assert.equal(await ev(() => undoStack.length), 0);
  });

  test("undo removes a created card", async () => {
    await ev(() => createCard("Temp", null));
    await ev(() => undo());
    assert.equal(await raw("Temp.md"), null);
    assert.equal(await fsText("Temp.md"), null);
  });

  test("delete puts a copy in .trash on disk vaults, undo brings the card back", async () => {
    await ev(() => { vault.fs.kind = "disk"; });
    await ev(() => deleteCards(["Cards/Shed.md"]));
    const st = await ev(async () => ({ gone: !vault.notes.has("Cards/Shed.md"), trash: await vault.fs.read(".trash/Shed.md") }));
    await ev(() => { vault.fs.kind = "demo"; });
    assert.equal(st.gone, true);
    assert.match(st.trash, /Tools\./);
    await ev(() => undo());
    assert.match(await raw("Cards/Shed.md"), /Tools\./);
  });

  test("deleting several cards asks first", async () => {
    const page = (await import("./harness.mjs")).page;
    const done = ev(() => deleteCards(["Cards/Shed.md", "Cards/Garden.md"]));
    await page.click(".modal .mod-warning");
    await done;
    assert.deepEqual(await ev(() => [vault.notes.has("Cards/Shed.md"), vault.notes.has("Cards/Garden.md")]), [false, false]);
  });

  test("the undo stack keeps the last 20 actions", async () => {
    await ev(async () => { for (let i = 0; i < 25; i++) await setColor(["Cards/Shed.md"], i % 2 ? "red" : "blue"); });
    assert.equal(await ev(() => undoStack.length), 20);
  });
});

describe("tasks, daily notes and settings", () => {
  beforeEach(() => openVault({ demo: false, notes: NOTES }));

  test("toggleTask ticks the n-th checkbox, skipping code blocks", async () => {
    await ev(() => toggleTask("Cards/Garden.md", 2, true));
    assert.match(await raw("Cards/Garden.md"), /- \[ \] water\n- \[x\] plant\n```\n- \[ \] not a task\n```\n- \[x\] weed\n/);
    await ev(() => toggleTask("Cards/Garden.md", 1, false));
    assert.match(await raw("Cards/Garden.md"), /- \[ \] plant/);
  });

  test("task progress on a card counts checkboxes", async () => {
    assert.deepEqual(await ev(() => cardTaskProgress("Cards/Garden.md")), { done: 1, n: 3 });
    assert.equal(await ev(() => cardTaskProgress("Cards/Shed.md")), null);
  });

  test("today's note follows .obsidian/daily-notes.json and its template", async () => {
    await ev(async () => {
      await vault.fs.write(".obsidian/daily-notes.json", JSON.stringify({ folder: "/Journal/", format: "YYYY/MM-DD", template: "Templates/Plant" }));
      dailyCfg = null;
      await openToday();
    });
    const name = await ev(() => formatMoment(new Date(), "YYYY/MM-DD"));
    const p = `Journal/${name}.md`;
    assert.match(await raw(p), new RegExp(`# ${name.split("/").pop()}\\n`));
    assert.equal(await ev(() => editor.path), p);
    await ev(() => openToday());
    assert.equal(await ev((p) => [...vault.notes.keys()].filter((x) => x === p).length, p), 1, "opening it again doesn't make a second note");
  });

  test("settings go to the plugin's data.json on a vault with .obsidian, keeping other keys", async () => {
    await ev(async () => {
      vault.fs.kind = "disk";
      await vault.fs.write(DATA_PATH, JSON.stringify({ somethingElse: 1, pinned: [] }));
      vault.pluginData = {};
      S.pinned = ["Cards/Home.md"];
      await saveSettings();
      vault.fs.kind = "demo";
    });
    const data = JSON.parse(await fsText(".obsidian/plugins/supsidian/data.json"));
    assert.equal(data.somethingElse, 1);
    assert.deepEqual(data.pinned, ["Cards/Home.md"]);
    assert.equal(data.parentsField, "parents");
  });

  test("a custom parents field is used for the hierarchy", async () => {
    await ev(async () => { S.parentsField = "up"; await writeRaw("Cards/Kid.md", '---\nup: ["[[Shed]]"]\n---\n'); });
    assert.deepEqual(await parentsOf("Cards/Kid.md"), ["Cards/Shed.md"]);
    assert.deepEqual(await parentsOf("Cards/Garden.md"), [], "the old field is ignored");
    await settle();
  });
});

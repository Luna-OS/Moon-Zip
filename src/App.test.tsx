import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { nameProblem } from "./lib/names";
import { DEMO_ARCHIVES, DemoBridge } from "./lib/demo";

const bridge = (start: ConstructorParameters<typeof DemoBridge>[0] = {}) =>
  new DemoBridge({ stepMs: 0, ...start });

beforeEach(() => {
  localStorage.clear();
});

describe("start page", () => {
  it("shows the Moon Zip start page with its actions", async () => {
    render(<App bridge={bridge()} />);
    expect(await screen.findByRole("heading", { name: "Moon Zip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open archive/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New archive/ })).toBeInTheDocument();
    expect(await screen.findByText("7-Zip 26.03 inside", { exact: false })).toBeInTheDocument();
  });

  it("opens the picked archive and remembers it", async () => {
    render(<App bridge={bridge()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Open archive/ }));
    expect(await screen.findByRole("grid", { name: "Archive contents" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("moon-zip:recent")!)).toEqual([DEMO_ARCHIVES.photos]);
  });
});

describe("archive window", () => {
  it("lists the archive's root and walks into folders", async () => {
    render(<App bridge={bridge({ start: { kind: "open", path: DEMO_ARCHIVES.photos } })} />);
    const grid = await screen.findByRole("grid", { name: "Archive contents" });
    expect(within(grid).getByText("Night sky")).toBeInTheDocument();
    expect(within(grid).getByText("README.md")).toBeInTheDocument();
    expect(within(grid).queryByText("Orion.png")).not.toBeInTheDocument();

    fireEvent.doubleClick(within(grid).getByText("Night sky"));
    expect(await within(grid).findByText("Orion.png")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Folder in the archive" })).toHaveTextContent(
      "Night sky",
    );

    fireEvent.click(screen.getByRole("button", { name: "Up one folder" }));
    expect(await within(grid).findByText("README.md")).toBeInTheDocument();
  });

  it("finds items anywhere in the archive", async () => {
    render(<App bridge={bridge({ start: { kind: "open", path: DEMO_ARCHIVES.photos } })} />);
    await screen.findByRole("grid");
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in this archive" }), {
      target: { value: "cr3" },
    });
    const grid = screen.getByRole("grid");
    expect(within(grid).getByText("IMG_2041.cr3")).toBeInTheDocument();
    expect(within(grid).getByText("IMG_2042.cr3")).toBeInTheDocument();
    expect(screen.getByText(/2 matches/)).toBeInTheDocument();
  });

  it("asks for the password of an archive with hidden names, and again when it's wrong", async () => {
    render(<App bridge={bridge({ start: { kind: "open", path: DEMO_ARCHIVES.secret } })} />);
    const dialog = await screen.findByRole("dialog", { name: "Unlock Secret.7z" });
    const input = within(dialog).getByLabelText("Password");
    fireEvent.change(input, { target: { value: "sun" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Unlock/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That password is wrong");

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "moon" } });
    fireEvent.click(screen.getByRole("button", { name: /Unlock/ }));
    expect(await screen.findByText("Passwords.kdbx")).toBeInTheDocument();
    expect(screen.getByText("Encrypted")).toBeInTheDocument();
  });

  it("extracts the selection into a new folder and says where", async () => {
    const b = bridge({ start: { kind: "open", path: DEMO_ARCHIVES.photos } });
    render(<App bridge={b} />);
    const grid = await screen.findByRole("grid");
    fireEvent.click(within(grid).getByText("README.md"));
    fireEvent.click(screen.getByRole("button", { name: /Extract selected/ }));
    const dialog = await screen.findByRole("dialog", { name: "Extract README.md" });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Extract to")).toHaveValue(
        "C:\\Users\\Luna\\Downloads\\Moon photos",
      ),
    );
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: /^Extract$/ }));
    expect(
      await screen.findByText(/Extracted to C:\\Users\\Luna\\Downloads\\Moon photos/),
    ).toBeInTheDocument();
  });

  it("deletes after asking, and the list follows", async () => {
    render(<App bridge={bridge({ start: { kind: "open", path: DEMO_ARCHIVES.photos } })} />);
    const grid = await screen.findByRole("grid");
    fireEvent.click(within(grid).getByText("Notes"));
    fireEvent.keyDown(grid, { key: "Delete" });
    const dialog = await screen.findByRole("dialog", { name: "Delete Notes?" });
    expect(dialog).toHaveTextContent("4 files will be removed");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(grid).queryByText("Notes")).not.toBeInTheDocument());
  });

  it("renames with F2", async () => {
    render(<App bridge={bridge({ start: { kind: "open", path: DEMO_ARCHIVES.photos } })} />);
    const grid = await screen.findByRole("grid");
    fireEvent.click(within(grid).getByText("README.md"));
    fireEvent.keyDown(grid, { key: "F2" });
    const dialog = await screen.findByRole("dialog", { name: "Rename README.md" });
    fireEvent.change(within(dialog).getByLabelText("New name"), {
      target: { value: "Read me.md" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    expect(await within(grid).findByText("Read me.md")).toBeInTheDocument();
  });

  it("archives other programs made stay read-only", async () => {
    const b = bridge({ start: { kind: "open", path: DEMO_ARCHIVES.photos } });
    b.archives.get(DEMO_ARCHIVES.photos)!.listing.archive.type = "Rar5";
    render(<App bridge={b} />);
    await screen.findByRole("grid");
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add/ })).toBeDisabled();
  });
});

describe("task windows", () => {
  it("Compress to .zip runs right away and reports the new archive", async () => {
    const b = bridge({
      start: {
        kind: "task",
        action: "compress-zip",
        paths: ["C:\\Users\\Luna\\Pictures\\Comet.jpg"],
      },
    });
    render(<App bridge={b} />);
    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.getByText(/Created Comet\.zip in C:\\Users\\Luna\\Pictures/)).toBeInTheDocument();
    expect(b.archives.has("C:\\Users\\Luna\\Pictures\\Comet.zip")).toBe(true);
  });

  it("Add to archive… shows the dialog and creates an encrypted 7z", async () => {
    const b = bridge({
      start: { kind: "task", action: "add", paths: ["C:\\Users\\Luna\\Documents\\Essay.docx"] },
    });
    render(<App bridge={b} />);
    const dialog = await screen.findByRole("dialog", { name: "Compress Essay.docx" });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Save as")).toHaveValue(
        "C:\\Users\\Luna\\Documents\\Essay.7z",
      ),
    );
    fireEvent.change(within(dialog).getByLabelText("Password (optional)"), {
      target: { value: "moon" },
    });
    fireEvent.change(within(dialog).getByLabelText("Repeat it"), { target: { value: "mono" } });
    expect(within(dialog).getByText("The two passwords aren't the same.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Compress/ })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Repeat it"), { target: { value: "moon" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Compress/ }));
    expect(await screen.findByText("Done")).toBeInTheDocument();
    const made = b.archives.get("C:\\Users\\Luna\\Documents\\Essay.7z")!;
    expect(made.password).toBe("moon");
    expect(made.encryptedHeaders).toBe(true);
  });

  it("switching the format to ZIP changes the file name and hides the names option", async () => {
    render(
      <App
        bridge={bridge({
          start: { kind: "task", action: "add", paths: ["C:\\Users\\Luna\\Documents\\Essay.docx"] },
        })}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Save as")).toHaveValue(
        "C:\\Users\\Luna\\Documents\\Essay.7z",
      ),
    );
    fireEvent.click(within(dialog).getByRole("radio", { name: /ZIP/ }));
    expect(within(dialog).getByLabelText("Save as")).toHaveValue(
      "C:\\Users\\Luna\\Documents\\Essay.zip",
    );
    expect(within(dialog).queryByText(/Hide the file names/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("ZIP encryption")).toBeInTheDocument();
  });

  it("Test archive asks for the password and reports no errors", async () => {
    render(
      <App
        bridge={bridge({ start: { kind: "task", action: "test", paths: [DEMO_ARCHIVES.secret] } })}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Unlock Secret.7z" });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "moon" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Unlock/ }));
    expect(await screen.findByText("Secret.7z: no errors")).toBeInTheDocument();
  });
});

describe("rename rules", () => {
  it("refuses empty names, slashes and names already taken", () => {
    expect(nameProblem("", [])).toMatch(/Enter a name/);
    expect(nameProblem("a/b", [])).toMatch(/can't contain/);
    expect(nameProblem("Notes", ["notes"])).toMatch(/already here/);
    expect(nameProblem("fine.txt", ["other"])).toBeNull();
  });
});

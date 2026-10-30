import { expect, test, type Page } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

const MIN = 60_000;
const clock = (page: Page) => page.getByRole("timer");

async function ready(page: Page) {
  await page
    .locator('html[data-shortcuts="ready"]')
    .waitFor({ state: "attached" });
}

async function open(page: Page, storage?: Record<string, string>) {
  await page.clock.install({ time: new Date(2026, 4, 10, 9, 0, 0) });
  if (storage) {
    await page.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries))
        localStorage.setItem(k, v as string);
    }, storage);
  }
  await page.goto("/");
  await ready(page);
}

async function live(page: Page, ms: number, step = 60_000) {
  for (let t = 0; t < ms; t += step)
    await page.clock.runFor(Math.min(step, ms - t));
}

test.describe("fading while you focus", () => {
  test("the extras fade after a few quiet seconds and come back on movement", async ({
    page,
  }) => {
    await open(page);
    await page.keyboard.press("Space");
    await page.clock.runFor(2000);
    await expect(page.locator(".app[data-idle]")).toHaveCount(0);
    await page.clock.runFor(6000);
    await expect(page.locator(".app[data-idle]")).toHaveCount(1);
    await expect(page.locator(".topbar")).toHaveCSS("opacity", "0");
    // The clock and the main button stay.
    await expect(clock(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).not.toHaveCSS(
      "opacity",
      "0",
    );
    await page.mouse.move(300, 300);
    await expect(page.locator(".app[data-idle]")).toHaveCount(0);
    await expect(page.locator(".topbar")).not.toHaveCSS("opacity", "0");
  });

  test("nothing fades while paused, on a break, or before starting", async ({
    page,
  }) => {
    await open(page);
    await page.clock.runFor(10_000);
    await expect(page.locator(".app[data-idle]")).toHaveCount(0);
    await page.keyboard.press("Space");
    await page.clock.runFor(10_000);
    await expect(page.locator(".app[data-idle]")).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(page.locator(".app[data-idle]")).toHaveCount(0);
    await page.keyboard.press("2");
    await page.keyboard.press("Space");
    await page.clock.runFor(10_000);
    await expect(page.locator(".app[data-idle]")).toHaveCount(0);
  });

  test("can be switched off in Settings, and the choice is kept", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: "Settings" }).click();
    const toggle = page.getByRole("switch", {
      name: /Fade everything but the clock/,
    });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await page.getByRole("button", { name: "Close Settings" }).click();
    await page.keyboard.press("Space");
    await page.clock.runFor(12_000);
    await expect(page.locator(".app[data-idle]")).toHaveCount(0);
    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(
      page.getByRole("switch", { name: /Fade everything but the clock/ }),
    ).not.toBeChecked();
  });
});

/** A stand-in for Chrome's floating window: a separate document inside an iframe. */
async function fakeDocumentPip(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: {
        requestWindow: async (opts: { width: number; height: number }) => {
          const f = document.createElement("iframe");
          f.id = "fake-pip";
          f.style.cssText = `position:fixed;right:0;bottom:0;width:${opts.width}px;height:${opts.height}px;border:0;z-index:99`;
          document.body.appendChild(f);
          const w = f.contentWindow!;
          w.close = () => {
            w.dispatchEvent(new Event("pagehide"));
            f.remove();
          };
          return w;
        },
      },
    });
  });
}

test.describe("small floating timer (document window)", () => {
  test("shows the clock with one button that starts, pauses and resumes", async ({
    page,
  }) => {
    await fakeDocumentPip(page);
    await open(page);
    await page.getByRole("button", { name: "Open the small timer" }).click();
    const mini = page.frameLocator("#fake-pip");
    await expect(mini.getByRole("timer")).toHaveAccessibleName(
      "25 minutes remaining",
    );
    await expect(mini.getByTestId("mini-timer")).toContainText("Focus");
    // Styled with the app's own stylesheet.
    await expect(mini.locator(".mini-clock")).toHaveCSS("font-size", "52px");

    await mini.getByRole("button", { name: "Start" }).click();
    await expect(
      page.getByText("Running", { exact: true }).first(),
    ).toBeVisible();
    await live(page, 5 * MIN);
    await expect(mini.getByRole("timer")).toHaveAccessibleName(
      "20 minutes remaining",
    );
    await expect(clock(page)).toHaveAccessibleName("20 minutes remaining");

    await mini.getByRole("button", { name: "Pause" }).click();
    await expect(
      page.getByText("Paused", { exact: true }).first(),
    ).toBeVisible();
    await page.clock.runFor(2 * MIN);
    await expect(mini.getByRole("timer")).toHaveAccessibleName(
      "20 minutes remaining",
    );

    await mini.getByRole("button", { name: "Resume" }).click();
    await live(page, MIN);
    await expect(mini.getByRole("timer")).toHaveAccessibleName(
      "19 minutes remaining",
    );
  });

  test("offers the next phase when a session ends", async ({ page }) => {
    await fakeDocumentPip(page);
    await open(page);
    await page.keyboard.press("Space");
    await page.keyboard.press("p");
    const mini = page.frameLocator("#fake-pip");
    await live(page, 25 * MIN + 5000);
    await expect(mini.getByTestId("mini-timer")).toContainText("Complete");
    await mini.getByRole("button", { name: "Start short break" }).click();
    await expect(
      page
        .getByRole("tab", { name: /Short break/ })
        .or(page.getByRole("button", { name: /Short break/ }))
        .first(),
    ).toBeVisible();
    await expect(mini.getByTestId("mini-timer")).toContainText("Short break");
    await expect(mini.getByRole("button", { name: "Pause" })).toBeVisible();
  });

  test("P opens and closes it, and closing it from the window updates the button", async ({
    page,
  }) => {
    await fakeDocumentPip(page);
    await open(page);
    await page.keyboard.press("p");
    await expect(page.locator("#fake-pip")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Close the small timer" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("p");
    await expect(page.locator("#fake-pip")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open the small timer" }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("p");
    await expect(page.locator("#fake-pip")).toHaveCount(1);
    // The person closes the floating window itself.
    await page.evaluate(() => {
      const f = document.getElementById("fake-pip") as HTMLIFrameElement;
      f.contentWindow!.close();
    });
    await expect(
      page.getByRole("button", { name: "Open the small timer" }),
    ).toBeVisible();
    // And it can be opened again.
    await page.keyboard.press("p");
    await expect(page.locator("#fake-pip")).toHaveCount(1);
  });

  test("a refused window leaves nothing half open", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "documentPictureInPicture", {
        configurable: true,
        value: {
          requestWindow: async () => {
            throw new Error("NotAllowedError");
          },
        },
      });
    });
    await open(page);
    await page.keyboard.press("p");
    await expect(
      page.getByRole("button", { name: "Open the small timer" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#fake-pip")).toHaveCount(0);
  });
});

test.describe("small floating timer (video fallback)", () => {
  test("the browser play and pause controls drive the timer", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "documentPictureInPicture", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document, "pictureInPictureEnabled", {
        value: true,
        configurable: true,
      });
      const w = window as unknown as {
        __handlers: Record<string, () => void>;
        __pipVideo: HTMLVideoElement | null;
      };
      w.__handlers = {};
      w.__pipVideo = null;
      HTMLVideoElement.prototype.requestPictureInPicture = async function () {
        w.__pipVideo = this;
        Object.defineProperty(document, "pictureInPictureElement", {
          value: this,
          configurable: true,
        });
        return {} as PictureInPictureWindow;
      };
      document.exitPictureInPicture = async () => {
        Object.defineProperty(document, "pictureInPictureElement", {
          value: null,
          configurable: true,
        });
        w.__pipVideo?.dispatchEvent(new Event("leavepictureinpicture"));
      };
      const ms = navigator.mediaSession;
      const orig = ms.setActionHandler.bind(ms);
      ms.setActionHandler = (action, handler) => {
        if (handler) w.__handlers[action] = handler as () => void;
        else delete w.__handlers[action];
        orig(action, handler);
      };
    });
    await open(page);
    await page.getByRole("button", { name: "Open the small timer" }).click();
    await expect(
      page.getByRole("button", { name: "Close the small timer" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys((window as any).__handlers)
            .sort()
            .join(","),
        ),
      )
      .toBe("pause,play");

    await page.evaluate(() => (window as any).__handlers.play());
    await expect(
      page.getByText("Running", { exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.mediaSession.playbackState))
      .toBe("playing");
    await live(page, 3 * MIN);
    await expect
      .poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title))
      .toContain("22:00");

    await page.evaluate(() => (window as any).__handlers.pause());
    await expect(
      page.getByText("Paused", { exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.mediaSession.playbackState))
      .toBe("paused");

    // Leaving picture-in-picture clears the handlers and the button.
    await page.keyboard.press("p");
    await expect(
      page.getByRole("button", { name: "Open the small timer" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => Object.keys((window as any).__handlers).length),
      )
      .toBe(0);
  });

  test("there is no button when the browser can do neither", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "documentPictureInPicture", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document, "pictureInPictureEnabled", {
        value: false,
        configurable: true,
      });
    });
    await open(page);
    await expect(page.getByRole("button", { name: /small timer/ })).toHaveCount(
      0,
    );
    await page.keyboard.press("p");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

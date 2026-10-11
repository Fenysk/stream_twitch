import { describe, expect, it } from "vitest";
import { toExpressionKey, toImageUrl, toImageUrls } from "./expression-urls";

describe("toImageUrl", () => {
  it("construit l'URL de l'image d'une expression, avec sa version", () => {
    expect(toImageUrl({ id: "abcd0001", version: "1791706000000.5231" }, "top")).toBe(
      "/api/expressions/abcd0001/image/top?v=1791706000000.5231",
    );
  });

  it("change d'URL quand la version change : le cache ne sert pas l'ancienne image", () => {
    const before = toImageUrl({ id: "abcd0001", version: "1" }, "bottom");
    const after = toImageUrl({ id: "abcd0001", version: "2" }, "bottom");
    expect(before).not.toBe(after);
  });

  it("protège l'identifiant et la version dans l'URL", () => {
    expect(toImageUrl({ id: "a/b", version: "x&y" }, "source")).toBe(
      "/api/expressions/a%2Fb/image/source?v=x%26y",
    );
  });
});

describe("toImageUrls", () => {
  it("donne les deux moitiés", () => {
    expect(toImageUrls({ id: "photo", version: "7" })).toEqual({
      top: "/api/expressions/photo/image/top?v=7",
      bottom: "/api/expressions/photo/image/bottom?v=7",
    });
  });
});

describe("toExpressionKey", () => {
  it("distingue une expression, et chacune de ses versions", () => {
    expect(toExpressionKey({ id: "photo", version: "1" })).toBe("photo@1");
    expect(toExpressionKey({ id: "photo", version: "2" })).not.toBe(
      toExpressionKey({ id: "photo", version: "1" }),
    );
    expect(toExpressionKey({ id: "abcd0001", version: "1" })).not.toBe(
      toExpressionKey({ id: "photo", version: "1" }),
    );
  });
});

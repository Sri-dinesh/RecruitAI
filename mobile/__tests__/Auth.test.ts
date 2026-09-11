import { getPasswordStrength } from "../src/components/common/PasswordMeter";

describe("Authentication & Password Verification Logic", () => {
  test("evaluates empty password as score 0", () => {
    const res = getPasswordStrength("");
    expect(res.score).toBe(0);
    expect(res.label).toBe("");
  });

  test("evaluates short simple password as Weak", () => {
    const res = getPasswordStrength("abc");
    expect(res.score).toBe(1);
    expect(res.label).toBe("Weak");
  });

  test("evaluates 8+ character password with mixed case as Fair", () => {
    const res = getPasswordStrength("PasswordOnly");
    expect(res.score).toBe(2);
    expect(res.label).toBe("Fair");
  });

  test("evaluates 8+ chars with mixed case and digits as Good", () => {
    const res = getPasswordStrength("Password123");
    expect(res.score).toBe(3);
    expect(res.label).toBe("Good");
  });

  test("evaluates complex password with symbols as Strong", () => {
    const res = getPasswordStrength("P@ssw0rd!2026");
    expect(res.score).toBe(4);
    expect(res.label).toBe("Strong");
  });

  test("validates email formats accurately", () => {
    const validateEmail = (email: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    expect(validateEmail("recruiter@company.com")).toBe(true);
    expect(validateEmail("recruiter.hire+team@enterprise.co.uk")).toBe(true);
    expect(validateEmail("invalid-email-no-at")).toBe(false);
    expect(validateEmail("invalid@no-domain")).toBe(false);
  });
});

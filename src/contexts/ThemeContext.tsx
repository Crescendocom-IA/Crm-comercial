import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  accentColor: "blue",
  setAccentColor: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/*
 * `fg` é o texto que vai por cima do tom escolhido. Sem ele, --primary-foreground
 * ficava fixo (branco no claro, escuro no escuro) enquanto --primary mudava, e
 * 4 dos 5 tons falhavam o mínimo WCAG AA de 4.5:1 em pelo menos um tema —
 * esmeralda e laranja no claro davam ~2.6:1, quase o caso do --warning.
 *
 * Cada fg abaixo é o que mede melhor sobre o próprio tom, não uma escolha
 * estética: tons claros (esmeralda, laranja) pedem texto escuro; tons escuros
 * (violeta, rosa) pedem branco. Contrastes na mensagem do commit.
 */
const ACCENT_COLORS: Record<string, { light: string; dark: string; ring: string; fgLight: string; fgDark: string }> = {
  blue:    { light: "221 83% 53%", dark: "217 91% 60%", ring: "221 83% 53%", fgLight: "0 0% 100%",  fgDark: "240 6% 6%" },
  violet:  { light: "262 83% 58%", dark: "263 70% 50%", ring: "262 83% 58%", fgLight: "0 0% 100%",  fgDark: "0 0% 100%" },
  emerald: { light: "160 84% 39%", dark: "160 84% 39%", ring: "160 84% 39%", fgLight: "240 6% 6%",  fgDark: "240 6% 6%" },
  orange:  { light: "25 95% 53%",  dark: "25 95% 53%",  ring: "25 95% 53%",  fgLight: "240 6% 6%",  fgDark: "240 6% 6%" },
  rose:    { light: "347 77% 50%", dark: "347 77% 50%", ring: "347 77% 50%", fgLight: "0 0% 100%",  fgDark: "0 0% 100%" },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem("fc-theme") as Theme) || "light");
  const [accentColor, setAccentState] = useState(() => localStorage.getItem("fc-accent") || "blue");

  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (t === "system") {
      const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(sys);
    } else {
      root.classList.add(t);
    }
  };

  const applyAccent = (color: string) => {
    const root = document.documentElement;
    const isDark = root.classList.contains("dark");
    const palette = ACCENT_COLORS[color] || ACCENT_COLORS.blue;
    const val = isDark ? palette.dark : palette.light;
    const fg = isDark ? palette.fgDark : palette.fgLight;
    root.style.setProperty("--primary", val);
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--ring", palette.ring);
    root.style.setProperty("--sidebar-primary", val);
    root.style.setProperty("--sidebar-primary-foreground", fg);
    root.style.setProperty("--sidebar-ring", palette.ring);
  };

  useEffect(() => {
    applyTheme(theme);
    applyAccent(accentColor);
  }, [theme, accentColor]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (theme === "system") { applyTheme("system"); applyAccent(accentColor); } };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, accentColor]);

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem("fc-theme", t); };
  const setAccentColor = (c: string) => { setAccentState(c); localStorage.setItem("fc-accent", c); };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

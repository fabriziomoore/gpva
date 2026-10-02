import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// "rounded-card" (raio padrão dos cards, --radius-card em styles.css) precisa
// ser conhecido pelo tailwind-merge como um rounded-*; senão ele não substitui
// o rounded-md padrão de componentes como o Button e os dois ficam na classe.
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ["card"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

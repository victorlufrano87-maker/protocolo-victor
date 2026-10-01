"use client";
export default function PrintButton() {
  return <button className="pri noprint" onClick={() => window.print()}>Salvar em PDF / imprimir</button>;
}

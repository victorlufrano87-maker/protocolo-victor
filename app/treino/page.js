import TrainingApp from "@/components/training/app";
import "./training.css";
export const metadata = {
  title: "Seu treino · Protocolo",
  robots: {
    index: false
  },
  manifest: "/training-manifest.json",
  appleWebApp: {
    capable: true,
    title: "Meu treino",
    statusBarStyle: "black-translucent"
  }
};
export default function Page() {
  return <TrainingApp />;
}

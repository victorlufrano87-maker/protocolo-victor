import TrainingApp from "@/components/training/app";
import "./training.css";
export const metadata = {
  title: "Tropa do Batata · Seu treino",
  robots: {
    index: false
  },
  manifest: "/training-manifest.json",
  appleWebApp: {
    capable: true,
    title: "Tropa do Batata",
    statusBarStyle: "black-translucent"
  }
};
export default function Page() {
  return <TrainingApp />;
}

import TrainingApp from "@/components/training/app";
import "./training.css";
export const metadata = {
  title: "GYM RATS · Seu treino",
  robots: {
    index: false
  },
  manifest: "/training-manifest.json",
  appleWebApp: {
    capable: true,
    title: "GYM RATS",
    statusBarStyle: "black-translucent"
  }
};
export default function Page() {
  return <TrainingApp />;
}

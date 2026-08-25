import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Capacity from "./pages/Capacity";
import Intake from "./pages/Intake";
import PrototypeConsole from "./pages/PrototypeConsole";
import PrototypeInteraction from "./pages/PrototypeInteraction";

function Router() {
  return <DashboardLayout><Switch><Route path="/" component={PrototypeConsole}/><Route path="/interactions/:id" component={PrototypeInteraction}/><Route path="/intake" component={Intake}/><Route path="/capacity" component={Capacity}/><Route path="/404" component={NotFound}/><Route component={NotFound}/></Switch></DashboardLayout>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

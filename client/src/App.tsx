import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import AccountMapping from "./pages/AccountMapping";
import BindingReview from "./pages/BindingReview";
import Capacity from "./pages/Capacity";
import Integrations from "./pages/Integrations";
import Policy from "./pages/Policy";
import PrototypeConsole from "./pages/PrototypeConsole";
import PrototypeInteraction from "./pages/PrototypeInteraction";
import SupportPerformance from "./pages/SupportPerformance";
import VerdictFixtures from "./pages/VerdictFixtures";

function Router() {
  return <DashboardLayout><Switch><Route path="/" component={PrototypeConsole}/><Route path="/mappings" component={AccountMapping}/><Route path="/bindings/:bindingId" component={BindingReview}/><Route path="/bindings" component={BindingReview}/><Route path="/interactions/:id" component={PrototypeInteraction}/><Route path="/policy" component={Policy}/><Route path="/capacity" component={Capacity}/><Route path="/performance" component={SupportPerformance}/><Route path="/integrations" component={Integrations}/><Route path="/verdict-fixtures" component={VerdictFixtures}/><Route path="/404" component={NotFound}/><Route component={NotFound}/></Switch></DashboardLayout>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

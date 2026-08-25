import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Capacity from "./pages/Capacity";
import Architecture from "./pages/Architecture";
import Intake from "./pages/Intake";
import Integrations from "./pages/Integrations";
import PrototypeConsole from "./pages/PrototypeConsole";
import PrototypeInteraction from "./pages/PrototypeInteraction";
import HubSpot from "./pages/HubSpot";
import SlackConnections from "./pages/SlackConnections";
import DemoHubSpot from "./pages/DemoHubSpot";

function Router() {
  return <DashboardLayout><Switch><Route path="/" component={PrototypeConsole}/><Route path="/architecture" component={Architecture}/><Route path="/interactions/:id" component={PrototypeInteraction}/><Route path="/intake" component={Intake}/><Route path="/capacity" component={Capacity}/><Route path="/integrations" component={Integrations}/><Route path="/integrations/hubspot" component={HubSpot}/><Route path="/integrations/demo-hubspot" component={DemoHubSpot}/><Route path="/integrations/slack" component={SlackConnections}/><Route path="/404" component={NotFound}/><Route component={NotFound}/></Switch></DashboardLayout>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

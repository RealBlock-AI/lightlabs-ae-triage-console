import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Interaction from "./pages/Interaction";
import Capacity from "./pages/Capacity";
import HubSpot from "./pages/HubSpot";
import ContactMapping from "./pages/ContactMapping";
import SlackConnections from "./pages/SlackConnections";
import KnowledgeLibrary from "./pages/KnowledgeLibrary";
import DashboardLayout from "./components/DashboardLayout";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/interactions/:id"} component={Interaction} />
        <Route path={"/capacity"} component={Capacity} />
        <Route path={"/integrations/hubspot"} component={HubSpot} />
        <Route path={"/integrations/mapping"} component={ContactMapping} />
        <Route path={"/connections/slack"} component={SlackConnections} />
        <Route path={"/knowledge"} component={KnowledgeLibrary} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

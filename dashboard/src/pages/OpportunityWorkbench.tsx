import { OpportunityWorkbenchView } from './opportunity-workbench/OpportunityWorkbenchView';
import { useOpportunityWorkbenchController } from './opportunity-workbench/workbench-controller';
import '../styles/workflow-shared.css';
import './opportunity-workbench/opportunity-workbench.css';

export function OpportunityWorkbench() {
  const controller = useOpportunityWorkbenchController();
  return <OpportunityWorkbenchView controller={controller} />;
}

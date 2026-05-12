import type { OpportunityWorkbenchController } from './workbench-controller';
import {
  WorkbenchActionReviewSection,
  WorkbenchBoardSection,
  WorkbenchControlSection,
  WorkbenchCreationFeedSection,
  WorkbenchDetailSection,
  WorkbenchHeaderSection,
  WorkbenchRecoveryFeedbackSection,
} from './WorkbenchSections';

type OpportunityWorkbenchViewProps = {
  controller: OpportunityWorkbenchController;
};

export function OpportunityWorkbenchView({ controller }: OpportunityWorkbenchViewProps) {
  return (
    <div className="page opportunity-workbench">
      <WorkbenchHeaderSection controller={controller} />
      <WorkbenchRecoveryFeedbackSection controller={controller} />
      <WorkbenchControlSection controller={controller} />
      <WorkbenchActionReviewSection controller={controller} />
      <WorkbenchCreationFeedSection controller={controller} />
      <WorkbenchBoardSection controller={controller} />
      <WorkbenchDetailSection controller={controller} />
    </div>
  );
}

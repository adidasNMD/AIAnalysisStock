import type { OpportunitySummary, OpportunitySourceProvenanceItem } from '../../api';
import { catalystConfidenceLabel } from './model';
import {
  buildSourceProvenanceInspection,
  sourceProvenanceStatusLabel,
  type SourceProvenanceFieldStatus,
} from './source-provenance';

type SourceProvenanceBlockProps = {
  opportunity: OpportunitySummary;
  limit?: number;
};

function provenanceConfidenceLabel(item: OpportunitySourceProvenanceItem) {
  return catalystConfidenceLabel(item.confidence === 'unknown' ? undefined : item.confidence) || 'UNKNOWN';
}

function provenanceTone(item: OpportunitySourceProvenanceItem) {
  switch (item.confidence) {
    case 'confirmed':
      return 'confirmed';
    case 'inferred':
      return 'inferred';
    case 'placeholder':
      return 'placeholder';
    default:
      return 'unknown';
  }
}

function provenanceValue(item: OpportunitySourceProvenanceItem) {
  return [item.value, item.note].filter(Boolean).join(' · ');
}

function statusTone(status: SourceProvenanceFieldStatus) {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'conflict') return 'conflict';
  if (status === 'missing') return 'missing';
  return 'weak';
}

export function SourceProvenanceBlock({ opportunity, limit = 5 }: SourceProvenanceBlockProps) {
  const provenance = opportunity.sourceProvenance;
  const fieldEvidence = opportunity.fieldEvidence;
  if ((!provenance || provenance.total === 0) && (!fieldEvidence || fieldEvidence.total === 0)) return null;
  const inspection = buildSourceProvenanceInspection(opportunity, 4);
  const activeProvenance = provenance && provenance.total > 0 ? provenance : null;
  const confirmedTotal = activeProvenance ? activeProvenance.total : fieldEvidence?.total || 0;
  const confirmedCount = activeProvenance
    ? activeProvenance.confirmed
    : fieldEvidence?.items.filter((item) => item.confidence === 'confirmed').length || 0;
  const inspectionSummary = inspection
    ? [
        inspection.conflictFields ? `${inspection.conflictFields} conflict` : '',
        inspection.weakFields ? `${inspection.weakFields} weak` : '',
        inspection.missingFields ? `${inspection.missingFields} missing` : '',
      ].filter(Boolean).join(' · ') || 'clean'
    : '';

  const items = provenance?.items.slice(0, limit) || [];
  const sources = activeProvenance ? activeProvenance.sources : fieldEvidence?.sources || [];

  return (
    <div className="source-provenance-block" data-source-provenance={opportunity.id}>
      <div className="source-provenance-head">
        <div>
          <span>Source provenance</span>
          <strong>
            {confirmedCount}/{confirmedTotal} confirmed
            {fieldEvidence ? ` · ${fieldEvidence.fields} fields` : ''}
          </strong>
        </div>
      </div>

      <div className="source-provenance-sources">
        {sources.slice(0, 4).map((source) => (
          <span key={source}>{source}</span>
        ))}
      </div>

      {inspection && (
        <div className="source-provenance-inspection" data-source-provenance-inspection>
          <div className="source-provenance-inspection-head">
            <span>{inspection.confirmedFields}/{inspection.totalFields} fields confirmed</span>
            <em>{inspectionSummary}</em>
          </div>
          <div className="source-provenance-inspection-list">
            {inspection.rows.map((row) => (
              <div
                key={row.field}
                className={`source-provenance-inspection-row ${statusTone(row.status)}`}
                data-source-provenance-field={row.field}
                data-source-provenance-status={row.status}
              >
                <div>
                  <strong>{row.label}</strong>
                  <p>
                    {row.field} · {row.sourceCount} sources · {row.confidence}
                    {row.valueCount > 1 ? ` · ${row.valueCount} values` : ''}
                  </p>
                  {row.adoptedValue && (
                    <p className="source-provenance-adopted">Adopted: {row.adoptedValue}</p>
                  )}
                  {row.valueGroups.length > 1 && (
                    <div className="source-provenance-value-groups" data-source-provenance-values={row.field}>
                      {row.valueGroups.slice(0, 3).map((value) => (
                        <span
                          key={`${row.field}:${value.value}`}
                          className={value.adopted ? 'adopted' : ''}
                          title={`${value.sources.join(', ')} · ${value.confidence}`}
                        >
                          {value.adopted ? 'adopted ' : ''}
                          {value.value}
                          <em>{value.count}</em>
                        </span>
                      ))}
                    </div>
                  )}
                  {row.status !== 'confirmed' && (
                    <p className="source-provenance-review-hint">{row.reviewHint}</p>
                  )}
                </div>
                <span>{sourceProvenanceStatusLabel(row.status)}</span>
              </div>
            ))}
            {inspection.hiddenCount > 0 && (
              <div className="source-provenance-more">+{inspection.hiddenCount} more provenance fields</div>
            )}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="source-provenance-list">
          {items.map((item) => (
            <div key={item.id} className="source-provenance-item" data-source-provenance-item={item.kind}>
              <div className="source-provenance-copy">
                <div className="source-provenance-title">
                  <span>{item.label}</span>
                  <em className={`source-provenance-confidence ${provenanceTone(item)}`}>
                    {provenanceConfidenceLabel(item)}
                  </em>
                </div>
                <p>{item.source}{provenanceValue(item) ? ` · ${provenanceValue(item)}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

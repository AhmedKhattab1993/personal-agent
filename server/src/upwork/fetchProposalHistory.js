import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { graphql } from './client.js';

const PAGE_SIZE = 20;
const STATUSES = [
  'Accepted',
  'Declined',
  'Withdrawn',
  'Offered',
  'Activated',
  'Archived',
  'Hired',
  'Pending',
];

const MONEY_FIELDS = /* GraphQL */ `
  rawValue
  currency
  displayValue
`;

const SORT = {
  field: 'CREATEDDATETIME',
  sortOrder: 'DESC',
};

const PROPOSAL_CORE_QUERY = /* GraphQL */ `
  query ProposalCore(
    $filter: VendorProposalFilter!,
    $sort: VendorProposalSortAttribute!,
    $pagination: Pagination!
  ) {
    vendorProposals(filter: $filter, sortAttribute: $sort, pagination: $pagination) {
      totalCount
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        cursor
        node {
          id
          proposalCoverLetter
          viewedByClient
          annotations
          status {
            status
            reason {
              id
              reason
              description
            }
          }
          auditDetails {
            createdDateTime {
              rawValue
              displayValue
            }
            modifiedDateTime {
              rawValue
              displayValue
            }
          }
          terms {
            chargeRate {
              ${MONEY_FIELDS}
            }
            estimatedDuration {
              id
              label
            }
            upfrontPaymentPercent
          }
          projectPlan {
            id
            milestones {
              description
              dueDate
              amount
            }
          }
          user {
            id
            nid
            rid
            name
            publicUrl
            ciphertext
          }
          organization {
            id
            rid
            legacyId
            name
            type
            legacyType
            active
            hidden
            photoUrl
            creationDate
          }
          marketplaceJobPosting {
            id
            content {
              title
            }
          }
        }
      }
    }
  }
`;

const JOB_DETAIL_QUERY = /* GraphQL */ `
  query ProposalJobDetail(
    $filter: VendorProposalFilter!,
    $sort: VendorProposalSortAttribute!,
    $pagination: Pagination!
  ) {
    vendorProposals(filter: $filter, sortAttribute: $sort, pagination: $pagination) {
      edges {
        node {
          id
          marketplaceJobPosting {
            id
            workFlowState {
              status
              closeResult
            }
            content {
              title
              description
            }
            attachments {
              id
              sequenceNumber
              fileName
              fileSize
            }
            classification {
              category {
                id
                ontologyId
                preferredLabel
              }
              subCategory {
                id
                ontologyId
                preferredLabel
              }
              occupation {
                id
                ontologyId
                preferredLabel
              }
              skills {
                id
                ontologyId
                preferredLabel
                prettyName
              }
              additionalSkills {
                id
                ontologyId
                preferredLabel
                prettyName
              }
            }
            contractTerms {
              contractStartDate
              contractEndDate
              contractType
              onSiteType
              personsToHire
              experienceLevel
              fixedPriceContractTerms {
                amount {
                  ${MONEY_FIELDS}
                }
                maxAmount {
                  ${MONEY_FIELDS}
                }
              }
              hourlyContractTerms {
                engagementType
                notSureProjectDuration
                hourlyBudgetType
                hourlyBudgetMin
                hourlyBudgetMax
              }
              notSurePersonsToHire
              notSureExperiencelevel
            }
          }
        }
      }
    }
  }
`;

const JOB_ACTIVITY_QUERY = /* GraphQL */ `
  query ProposalJobActivity(
    $filter: VendorProposalFilter!,
    $sort: VendorProposalSortAttribute!,
    $pagination: Pagination!
  ) {
    vendorProposals(filter: $filter, sortAttribute: $sort, pagination: $pagination) {
      edges {
        node {
          id
          marketplaceJobPosting {
            id
            activityStat {
              applicationsBidStats {
                avgRateBid {
                  ${MONEY_FIELDS}
                }
                minRateBid {
                  ${MONEY_FIELDS}
                }
                maxRateBid {
                  ${MONEY_FIELDS}
                }
                avgInterviewedRateBid {
                  ${MONEY_FIELDS}
                }
              }
              jobActivity {
                lastClientActivity
                invitesSent
                totalInvitedToInterview
                totalHired
                totalUnansweredInvites
                totalOffered
                totalRecommended
              }
            }
            contractorSelection {
              proposalRequirement {
                coverLetterRequired
                freelancerMilestonesAllowed
              }
              qualification {
                contractorType
                englishProficiency
                hasPortfolio
                hoursWorked
                risingTalent
                jobSuccessScore
                minEarning
              }
              location {
                countries
                states
                timezones
                localCheckRequired
                localMarket
                notSureLocationPreference
                localDescription
                localFlexibilityDescription
              }
            }
            additionalSearchInfo {
              highlightTitle
            }
            annotations {
              tags
              customFields {
                key
                value
              }
            }
            canClientReceiveContractProposal
          }
        }
      }
    }
  }
`;

function defaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(`data/upwork-proposal-history-${stamp}.json`);
}

function mergeDeep(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) return right ?? left;
  if (!isPlainObject(left) || !isPlainObject(right)) return right ?? left;

  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    merged[key] = key in merged ? mergeDeep(merged[key], value) : value;
  }
  return merged;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && value.constructor === Object;
}

function mergeProposal(existing, incoming, requestedStatus) {
  const merged = mergeDeep(existing ?? {}, incoming);
  const buckets = new Set(existing?.requestedStatusBuckets ?? []);
  buckets.add(requestedStatus);
  merged.requestedStatusBuckets = [...buckets].sort();
  return merged;
}

function sortByCreatedDesc(proposals) {
  return proposals.sort((a, b) => {
    const aRaw = Number(a.auditDetails?.createdDateTime?.rawValue ?? 0);
    const bRaw = Number(b.auditDetails?.createdDateTime?.rawValue ?? 0);
    return bRaw - aRaw;
  });
}

function summarize({ proposals, statusStats, outputPath }) {
  const byActualStatus = {};
  const proposalsWithCoverLetter = proposals.filter((proposal) => proposal.proposalCoverLetter).length;
  const proposalsWithJobDescription = proposals.filter((proposal) => (
    proposal.marketplaceJobPosting?.content?.description
  )).length;

  for (const proposal of proposals) {
    const status = proposal.status?.status ?? 'UNKNOWN';
    byActualStatus[status] = (byActualStatus[status] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'upwork.graphql.vendorProposals',
    requestedStatusBuckets: STATUSES,
    sort: SORT,
    pageSize: PAGE_SIZE,
    statusStats,
    fetchedUniqueProposals: proposals.length,
    proposalsWithCoverLetter,
    proposalsWithJobDescription,
    byActualStatus,
    newestCreatedDateTime: proposals[0]?.auditDetails?.createdDateTime?.displayValue ?? null,
    oldestCreatedDateTime: proposals.at(-1)?.auditDetails?.createdDateTime?.displayValue ?? null,
    outputPath,
  };
}

async function fetchPage(status, pagination) {
  const variables = {
    filter: { status_eq: status },
    sort: SORT,
    pagination,
  };

  const core = await graphql(PROPOSAL_CORE_QUERY, variables);
  const detail = await graphql(JOB_DETAIL_QUERY, variables);
  const activity = await graphql(JOB_ACTIVITY_QUERY, variables);

  const byId = new Map();
  for (const edge of core.vendorProposals.edges ?? []) {
    byId.set(edge.node.id, edge.node);
  }
  for (const source of [detail, activity]) {
    for (const edge of source.vendorProposals.edges ?? []) {
      byId.set(edge.node.id, mergeDeep(byId.get(edge.node.id) ?? {}, edge.node));
    }
  }

  return {
    totalCount: core.vendorProposals.totalCount,
    pageInfo: core.vendorProposals.pageInfo,
    proposals: [...byId.values()],
  };
}

async function main() {
  const outputPath = resolve(process.argv[2] ?? defaultOutputPath());
  const proposalsById = new Map();
  const statusStats = {};

  console.log('Fetching Upwork proposal history...');

  for (const status of STATUSES) {
    let after;
    let pages = 0;
    let rawFetched = 0;
    let totalCount = null;

    while (true) {
      const pagination = {
        first: PAGE_SIZE,
        ...(after ? { after } : {}),
      };
      const result = await fetchPage(status, pagination);
      totalCount ??= result.totalCount;
      rawFetched += result.proposals.length;
      pages += 1;

      for (const proposal of result.proposals) {
        proposalsById.set(
          proposal.id,
          mergeProposal(proposalsById.get(proposal.id), proposal, status)
        );
      }

      console.log(
        `  ${status}: page ${pages}, ${result.proposals.length} records, ${proposalsById.size} unique total`
      );

      if (
        result.proposals.length === 0
        || !result.pageInfo?.hasNextPage
        || !result.pageInfo.endCursor
      ) {
        break;
      }
      after = result.pageInfo.endCursor;
    }

    statusStats[status] = {
      apiTotalCount: totalCount,
      rawFetched,
      pages,
    };
  }

  const proposals = sortByCreatedDesc([...proposalsById.values()]);
  const summary = summarize({ proposals, statusStats, outputPath });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ summary, proposals }, null, 2)}\n`);

  console.log(`Wrote ${proposals.length} unique proposals to ${outputPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exit(1);
});

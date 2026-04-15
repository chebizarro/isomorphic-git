import './typedefs.js'

import { STAGE } from './api/STAGE.js'
import { TREE } from './api/TREE.js'
import { WORKDIR } from './api/WORKDIR.js'
import { abortMerge } from './api/abortMerge.js'
import { add } from './api/add.js'
import { addNote } from './api/addNote.js'
import { addRemote } from './api/addRemote.js'
import { annotatedTag } from './api/annotatedTag.js'
import { branch } from './api/branch.js'
import { checkout } from './api/checkout.js'
import { clone } from './api/clone.js'
import { commit } from './api/commit.js'
import { currentBranch } from './api/currentBranch.js'
import { deleteBranch } from './api/deleteBranch.js'
import { deleteRef } from './api/deleteRef.js'
import { deleteRemote } from './api/deleteRemote.js'
import { deleteTag } from './api/deleteTag.js'
import { expandOid } from './api/expandOid.js'
import { expandRef } from './api/expandRef.js'
import { fastForward } from './api/fastForward.js'
import { fetch } from './api/fetch.js'
import { findMergeBase } from './api/findMergeBase.js'
import { findRoot } from './api/findRoot.js'
import { getConfig } from './api/getConfig.js'
import { getConfigAll } from './api/getConfigAll.js'
import { getRemoteInfo } from './api/getRemoteInfo.js'
import { getRemoteInfo2 } from './api/getRemoteInfo2.js'
import { hashBlob } from './api/hashBlob.js'
import { indexPack } from './api/indexPack.js'
import { init } from './api/init.js'
import { isDescendent } from './api/isDescendent.js'
import { isIgnored } from './api/isIgnored.js'
import { listBranches } from './api/listBranches.js'
import { listFiles } from './api/listFiles.js'
import { listNotes } from './api/listNotes.js'
import { listRefs } from './api/listRefs.js'
import { listRemotes } from './api/listRemotes.js'
import { listServerRefs } from './api/listServerRefs.js'
import { listTags } from './api/listTags.js'
import { log } from './api/log.js'
import { merge } from './api/merge.js'
import { packObjects } from './api/packObjects.js'
import { pull } from './api/pull.js'
import { push } from './api/push.js'
import { readBlob } from './api/readBlob.js'
import { readCommit } from './api/readCommit.js'
import { readNote } from './api/readNote.js'
import { readObject } from './api/readObject.js'
import { readTag } from './api/readTag.js'
import { readTree } from './api/readTree.js'
import { remove } from './api/remove.js'
import { removeNote } from './api/removeNote.js'
import { renameBranch } from './api/renameBranch.js'
import { resetIndex } from './api/resetIndex.js'
import { resolveRef } from './api/resolveRef.js'
import { setConfig } from './api/setConfig.js'
import { aheadBehind } from './api/aheadBehind.js'
import { readReflog } from './api/readReflog.js'
import { reset } from './api/reset.js'
import { revparse } from './api/revparse.js'
import { diffTrees, diffFile, diffIndexToWorkdir, diffStat, formatPatch, findRenames, DELTA } from './api/diff.js'
import { blame } from './api/blame.js'
import { applyPatch } from './api/applyPatch.js'
import { describe } from './api/describe.js'
import { rebase } from './api/rebase.js'
import { repositoryState, repositoryStateCleanup, isBare, isEmpty, isShallow, isHeadDetached, isHeadUnborn, REPOSITORY_STATE } from './api/repository.js'
import { indexHasConflicts, indexConflictGet, indexConflictAdd, indexConflictRemove, indexConflictIterator, indexConflictCleanup } from './api/indexConflicts.js'
import { getAttr, getAttrMany, getAttrAll, ATTR_VALUE } from './api/getAttr.js'
import { submoduleList, submoduleStatus, submoduleInit, submoduleDeinit, submoduleSync, submoduleAdd, SUBMODULE_STATUS } from './api/submodule.js'
import { mergeAnalysis, MERGE_ANALYSIS, MERGE_PREFERENCE } from './api/mergeAnalysis.js'
import { applyFilter, filterList, FILTER_MODE } from './api/filters.js'
import { revwalk, SORT } from './api/revwalk.js'
import { deleteConfigSection, listConfigSubsections, deleteConfig, appendConfig } from './api/configExt.js'
import { commitNthAncestor, commitParent, commitHeaderField } from './api/commitExt.js'
import { branchUpstream, setBranchUpstream, unsetBranchUpstream, branchNameIsValid, branchIsHead } from './api/branchExt.js'
import { diffTreeToIndex, diffIndexToIndex, diffBlobs, diffPatchId } from './api/diffExt.js'
import { renameRemote, setRemoteUrl, setRemotePushUrl, remoteDefaultBranch } from './api/remoteExt.js'
import { listShallowRoots, unshallow } from './api/shallowExt.js'
import { sparseCheckoutInit, sparseCheckoutSet, sparseCheckoutAdd, sparseCheckoutList } from './api/sparseCheckout.js'
import { foreachRef, refNameIsValid, symbolicRefTarget } from './api/refsExt.js'
import { buildTree, walkTree, treeEntryByPath } from './api/treeExt.js'
import { signatureFromBuffer, signatureCreate, signatureDefault } from './api/signature.js'
import { ignoreAddRule, ignoreClearRules, ignorePathIsIgnored } from './api/ignoreExt.js'
import { deleteReflog, dropReflogEntry, renameReflog } from './api/reflogExt.js'
import { refTransaction } from './api/transaction.js'
import { Pathspec, pathspecNew, pathspecMatchesPath } from './api/pathspec.js'
import { blobIsBinary, blobSize, blobCreateFromWorkdir } from './api/blobExt.js'
import { emailCreateFromCommit } from './api/email.js'
import { refspecParse, refspecTransform, refspecSrcMatches } from './api/refspecExt.js'
import { graphAheadBehind, graphDescendantOf } from './api/graphExt.js'
import { tagForeach, tagPeel, tagTarget, tagCreateFromBuffer } from './api/tagExt.js'
import { noteForeach, noteRead, noteCreate, noteRemove } from './api/notesExt.js'
import { PackBuilder, packBuilderNew } from './api/packBuilder.js'
import { Indexer, indexerNew } from './api/indexer.js'
import { Mailmap, mailmapFromRepository, mailmapResolve } from './api/mailmap.js'
import { odbAddBackend, odbClearBackends, odbListBackends, odbRead, odbWrite, odbExists } from './api/odbExt.js'
import { messagePrettify, messageTrailers } from './api/message.js'
import { createProxyAgent } from './utils/proxy.js'
import { worktreeList, worktreeAdd, worktreeLock, worktreeUnlock, worktreeIsLocked, worktreePrune } from './api/worktree.js'
import { cherryPick } from './api/cherryPick.js'
import { revert } from './api/revert.js'
import { stash } from './api/stash.js'
import { status } from './api/status.js'
import { statusMatrix } from './api/statusMatrix.js'
import { tag } from './api/tag.js'
import { updateIndex } from './api/updateIndex.js'
import { version } from './api/version.js'
import { walk } from './api/walk.js'
import { writeBlob } from './api/writeBlob.js'
import { writeCommit } from './api/writeCommit.js'
import { writeObject } from './api/writeObject.js'
import { writeRef } from './api/writeRef.js'
import { writeTag } from './api/writeTag.js'
import { writeTree } from './api/writeTree.js'
import * as Errors from './errors/index.js'

// named exports
export {
  Errors,
  STAGE,
  TREE,
  WORKDIR,
  aheadBehind,
  abortMerge,
  applyPatch,
  blame,
  cherryPick,
  describe,
  DELTA,
  diffFile,
  diffIndexToWorkdir,
  diffStat,
  diffTrees,
  findRenames,
  formatPatch,
  add,
  addNote,
  addRemote,
  annotatedTag,
  branch,
  checkout,
  clone,
  commit,
  getConfig,
  getConfigAll,
  setConfig,
  currentBranch,
  deleteBranch,
  deleteRef,
  deleteRemote,
  deleteTag,
  expandOid,
  expandRef,
  fastForward,
  fetch,
  findMergeBase,
  findRoot,
  getRemoteInfo,
  getRemoteInfo2,
  hashBlob,
  indexPack,
  init,
  isDescendent,
  isIgnored,
  listBranches,
  listFiles,
  listNotes,
  listRefs,
  listRemotes,
  listServerRefs,
  listTags,
  log,
  merge,
  packObjects,
  pull,
  push,
  readBlob,
  readCommit,
  readNote,
  readObject,
  readReflog,
  readTag,
  readTree,
  remove,
  removeNote,
  renameBranch,
  rebase,
  reset,
  resetIndex,
  revparse,
  updateIndex,
  resolveRef,
  status,
  statusMatrix,
  tag,
  version,
  walk,
  writeBlob,
  writeCommit,
  writeObject,
  writeRef,
  writeTag,
  writeTree,
  revert,
  stash,
  repositoryState,
  repositoryStateCleanup,
  isBare,
  isEmpty,
  isShallow,
  isHeadDetached,
  isHeadUnborn,
  REPOSITORY_STATE,
  indexHasConflicts,
  indexConflictGet,
  indexConflictAdd,
  indexConflictRemove,
  indexConflictIterator,
  indexConflictCleanup,
  getAttr,
  getAttrMany,
  getAttrAll,
  ATTR_VALUE,
  submoduleList,
  submoduleStatus,
  submoduleInit,
  submoduleDeinit,
  submoduleSync,
  submoduleAdd,
  SUBMODULE_STATUS,
  mergeAnalysis,
  MERGE_ANALYSIS,
  MERGE_PREFERENCE,
  applyFilter,
  filterList,
  FILTER_MODE,
  revwalk,
  SORT,
  deleteConfigSection,
  listConfigSubsections,
  deleteConfig,
  appendConfig,
  commitNthAncestor,
  commitParent,
  commitHeaderField,
  branchUpstream,
  setBranchUpstream,
  unsetBranchUpstream,
  branchNameIsValid,
  branchIsHead,
  diffTreeToIndex,
  diffIndexToIndex,
  diffBlobs,
  diffPatchId,
  renameRemote,
  setRemoteUrl,
  setRemotePushUrl,
  remoteDefaultBranch,
  listShallowRoots,
  unshallow,
  sparseCheckoutInit,
  sparseCheckoutSet,
  sparseCheckoutAdd,
  sparseCheckoutList,
  foreachRef,
  refNameIsValid,
  symbolicRefTarget,
  buildTree,
  walkTree,
  treeEntryByPath,
  signatureFromBuffer,
  signatureCreate,
  signatureDefault,
  ignoreAddRule,
  ignoreClearRules,
  ignorePathIsIgnored,
  deleteReflog,
  dropReflogEntry,
  renameReflog,
  refTransaction,
  Pathspec,
  pathspecNew,
  pathspecMatchesPath,
  blobIsBinary,
  blobSize,
  blobCreateFromWorkdir,
  emailCreateFromCommit,
  refspecParse,
  refspecTransform,
  refspecSrcMatches,
  graphAheadBehind,
  graphDescendantOf,
  tagForeach,
  tagPeel,
  tagTarget,
  tagCreateFromBuffer,
  noteForeach,
  noteRead,
  noteCreate,
  noteRemove,
  PackBuilder,
  packBuilderNew,
  Indexer,
  indexerNew,
  Mailmap,
  mailmapFromRepository,
  mailmapResolve,
  odbAddBackend,
  odbClearBackends,
  odbListBackends,
  odbRead,
  odbWrite,
  odbExists,
  messagePrettify,
  messageTrailers,
  createProxyAgent,
  worktreeList,
  worktreeAdd,
  worktreeLock,
  worktreeUnlock,
  worktreeIsLocked,
  worktreePrune,
}

// default export
export default {
  Errors,
  STAGE,
  TREE,
  WORKDIR,
  aheadBehind,
  add,
  abortMerge,
  applyPatch,
  addNote,
  addRemote,
  annotatedTag,
  branch,
  checkout,
  blame,
  cherryPick,
  clone,
  commit,
  DELTA,
  describe,
  diffFile,
  diffIndexToWorkdir,
  diffStat,
  diffTrees,
  findRenames,
  formatPatch,
  getConfig,
  getConfigAll,
  setConfig,
  currentBranch,
  deleteBranch,
  deleteRef,
  deleteRemote,
  deleteTag,
  expandOid,
  expandRef,
  fastForward,
  fetch,
  findMergeBase,
  findRoot,
  getRemoteInfo,
  getRemoteInfo2,
  hashBlob,
  indexPack,
  init,
  isDescendent,
  isIgnored,
  listBranches,
  listFiles,
  listNotes,
  listRefs,
  listRemotes,
  listServerRefs,
  listTags,
  log,
  merge,
  packObjects,
  pull,
  push,
  readBlob,
  readCommit,
  readNote,
  readObject,
  readReflog,
  readTag,
  readTree,
  remove,
  removeNote,
  renameBranch,
  rebase,
  reset,
  resetIndex,
  revparse,
  updateIndex,
  resolveRef,
  status,
  statusMatrix,
  tag,
  version,
  walk,
  writeBlob,
  writeCommit,
  writeObject,
  writeRef,
  writeTag,
  writeTree,
  revert,
  stash,
  repositoryState,
  repositoryStateCleanup,
  isBare,
  isEmpty,
  isShallow,
  isHeadDetached,
  isHeadUnborn,
  REPOSITORY_STATE,
  indexHasConflicts,
  indexConflictGet,
  indexConflictAdd,
  indexConflictRemove,
  indexConflictIterator,
  indexConflictCleanup,
  getAttr,
  getAttrMany,
  getAttrAll,
  ATTR_VALUE,
  submoduleList,
  submoduleStatus,
  submoduleInit,
  submoduleDeinit,
  submoduleSync,
  submoduleAdd,
  SUBMODULE_STATUS,
  mergeAnalysis,
  MERGE_ANALYSIS,
  MERGE_PREFERENCE,
  applyFilter,
  filterList,
  FILTER_MODE,
  revwalk,
  SORT,
  deleteConfigSection,
  listConfigSubsections,
  deleteConfig,
  appendConfig,
  commitNthAncestor,
  commitParent,
  commitHeaderField,
  branchUpstream,
  setBranchUpstream,
  unsetBranchUpstream,
  branchNameIsValid,
  branchIsHead,
  diffTreeToIndex,
  diffIndexToIndex,
  diffBlobs,
  diffPatchId,
  renameRemote,
  setRemoteUrl,
  setRemotePushUrl,
  remoteDefaultBranch,
  listShallowRoots,
  unshallow,
  sparseCheckoutInit,
  sparseCheckoutSet,
  sparseCheckoutAdd,
  sparseCheckoutList,
  foreachRef,
  refNameIsValid,
  symbolicRefTarget,
  buildTree,
  walkTree,
  treeEntryByPath,
  signatureFromBuffer,
  signatureCreate,
  signatureDefault,
  ignoreAddRule,
  ignoreClearRules,
  ignorePathIsIgnored,
  deleteReflog,
  dropReflogEntry,
  renameReflog,
  refTransaction,
  Pathspec,
  pathspecNew,
  pathspecMatchesPath,
  blobIsBinary,
  blobSize,
  blobCreateFromWorkdir,
  emailCreateFromCommit,
  refspecParse,
  refspecTransform,
  refspecSrcMatches,
  graphAheadBehind,
  graphDescendantOf,
  tagForeach,
  tagPeel,
  tagTarget,
  tagCreateFromBuffer,
  noteForeach,
  noteRead,
  noteCreate,
  noteRemove,
  PackBuilder,
  packBuilderNew,
  Indexer,
  indexerNew,
  Mailmap,
  mailmapFromRepository,
  mailmapResolve,
  odbAddBackend,
  odbClearBackends,
  odbListBackends,
  odbRead,
  odbWrite,
  odbExists,
  messagePrettify,
  messageTrailers,
  createProxyAgent,
  worktreeList,
  worktreeAdd,
  worktreeLock,
  worktreeUnlock,
  worktreeIsLocked,
  worktreePrune,
}

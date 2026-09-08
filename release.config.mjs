export const commitAnalyzerOptions = { preset: "conventionalcommits" };

const config = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", commitAnalyzerOptions],
    [
      "@semantic-release/release-notes-generator",
      { preset: "conventionalcommits" },
    ],
    [
      "@semantic-release/github",
      {
        successCommentCondition: false,
        failCommentCondition: false,
        releasedLabels: false,
      },
    ],
  ],
};

export default config;

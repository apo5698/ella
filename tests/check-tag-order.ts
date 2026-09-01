// Exercises the shared tag ordering used by the server and editor.
import { groupTags, sortNames, sortTags } from "../lib/tagOrder";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  const passed = actualJson === expectedJson;
  if (!passed) failures += 1;
  console.log(`${passed ? "pass" : "FAIL"}  ${label}`);
  if (!passed) {
    console.log(`        expected ${expectedJson}`);
    console.log(`        actual   ${actualJson}`);
  }
}

const manual = (name: string) => ({ name, source: "manual" });
const automatic = (name: string) => ({ name, source: "vision" });
const nested = (name: string, source: string, ...ancestors: string[]) => ({
  name,
  source,
  path: [...ancestors, name],
});

check(
  "pinyin order within a group",
  sortTags([
    automatic("测试武汉"),
    automatic("测试北京"),
    automatic("测试西安"),
    automatic("测试广州"),
    automatic("测试上海"),
    automatic("测试成都"),
    automatic("测试南京"),
  ]).map((tag) => tag.name),
  [
    "测试北京",
    "测试成都",
    "测试广州",
    "测试南京",
    "测试上海",
    "测试武汉",
    "测试西安",
  ],
);

check(
  "manual tags lead, each group in pinyin order",
  sortTags([
    automatic("测试武汉"),
    manual("测试上海"),
    automatic("测试成都"),
    manual("测试北京"),
  ]).map((tag) => tag.name),
  ["测试北京", "测试上海", "测试成都", "测试武汉"],
);

const fromServer = sortTags([
  manual("测试北京"),
  manual("测试上海"),
  automatic("测试成都"),
  automatic("测试武汉"),
]);
const afterAdd = sortTags([...fromServer, manual("测试南京")]);
check(
  "a tag added in the editor lands where a reload would put it",
  afterAdd.map((tag) => tag.name),
  sortTags([
    manual("测试北京"),
    manual("测试上海"),
    manual("测试南京"),
    automatic("测试成都"),
    automatic("测试武汉"),
  ]).map((tag) => tag.name),
);
check(
  "and it joins the manual group rather than the end",
  afterAdd.map((tag) => tag.name),
  ["测试北京", "测试南京", "测试上海", "测试成都", "测试武汉"],
);

const accepted = sortTags(
  fromServer.map((tag) =>
    tag.name === "测试武汉" ? { ...tag, source: "manual" } : tag,
  ),
);
check(
  "an accepted tag moves into the manual group",
  accepted.map((tag) => `${tag.name}:${tag.source}`),
  ["测试北京:manual", "测试上海:manual", "测试武汉:manual", "测试成都:vision"],
);

check(
  "digits read in figure order, not as text",
  sortNames(["测试项目10", "测试项目2", "测试项目1"]),
  ["测试项目1", "测试项目2", "测试项目10"],
);

check(
  "sortTags does not mutate its input",
  (() => {
    const input = [automatic("测试武汉"), manual("测试北京")];
    sortTags(input);
    return input.map((tag) => tag.name);
  })(),
  ["测试武汉", "测试北京"],
);

check(
  "a family stays together instead of scattering by name",
  sortTags([
    automatic("测试对象甲"),
    nested("测试成员乙", "vision", "测试分类"),
    automatic("测试项目乙"),
    nested("测试成员甲", "vision", "测试分类"),
    nested("测试分类", "vision"),
  ]).map((tag) => tag.name),
  ["测试对象甲", "测试分类", "测试成员甲", "测试成员乙", "测试项目乙"],
);

check(
  "a parent leads its own children",
  sortTags([
    nested("测试成员乙", "vision", "测试分类"),
    nested("测试分类", "vision"),
  ]).map((tag) => tag.name),
  ["测试分类", "测试成员乙"],
);

check(
  "a family holding a manual tag leads the ones that do not",
  sortTags([
    automatic("测试对象甲"),
    nested("测试成员乙", "manual", "测试分类"),
    nested("测试分类", "vision"),
  ]).map((tag) => tag.name),
  ["测试分类", "测试成员乙", "测试对象甲"],
);

check(
  "source does not reorder tags inside a family",
  sortTags([
    nested("测试成员乙", "vision", "测试分类"),
    nested("测试成员甲", "manual", "测试分类"),
    nested("测试分类", "vision"),
  ]).map((tag) => tag.name),
  ["测试分类", "测试成员甲", "测试成员乙"],
);

check(
  "grouping reports the same order, split by family",
  groupTags([
    automatic("测试对象甲"),
    nested("测试成员乙", "vision", "测试分类"),
    nested("测试分类", "vision"),
  ]).map((family) => family.map((tag) => tag.name)),
  [["测试对象甲"], ["测试分类", "测试成员乙"]],
);

check(
  "a tag with no path is its own family",
  groupTags([automatic("测试对象甲"), automatic("测试项目乙")]).map((family) =>
    family.map((tag) => tag.name),
  ),
  [["测试对象甲"], ["测试项目乙"]],
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

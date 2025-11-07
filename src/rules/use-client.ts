import type { Rule } from "eslint";
import type {
  Expression,
  ExpressionStatement,
  Identifier,
  ImportSpecifier,
  Node,
  Program,
  SpreadElement,
} from "estree";
import globals from "globals";
import { reactEvents } from "./react-events";
import { JSXOpeningElement } from "estree-jsx";
import Components from "eslint-plugin-react/lib/util/Components.js";
import componentUtil from "eslint-plugin-react/lib/util/componentUtil.js";

const useClientRegex = /^('|")use client('|")/;
const browserOnlyGlobals = Object.keys(globals.browser).reduce<
  Set<Exclude<keyof typeof globals.browser, keyof typeof globals.node>>
>((acc, curr) => {
  if (curr in globals.browser && !(curr in globals.node)) {
    acc.add(curr as any);
  }
  return acc;
}, new Set());

type Options = [
  {
    allowedServerHooks?: string[];
  },
];

const meta: Rule.RuleModule["meta"] = {
  docs: {
    description:
      "Enforce components are appropriately labeled with 'use client'.",
    recommended: true,
  },
  type: "problem",
  hasSuggestions: true,
  fixable: "code",
  schema: [
    {
      type: "object",
      properties: {
        allowedServerHooks: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    addUseClientHooks:
      '{{hook}} only works in Client Components. Add the "use client" directive at the top of the file to use it.',
    addUseClientBrowserAPI:
      'Browser APIs only work in Client Components. Add the "use client" directive at the top of the file to use it.',
    addUseClientCallbacks:
      'Functions can only be passed as props to Client Components. Add the "use client" directive at the top of the file to use it.',
    addUseClientClassComponent:
      'React Class Components can only be used in Client Components. Add the "use client" directive at the top of the file.',
    addUseClientFramerMotion:
      'Framer Motion components only work in Client Components. Add the "use client" directive at the top of the file to use them.',
    removeUseClient:
      "This file does not require the 'use client' directive, and it should be removed.",
  },
};

const create = Components.detect(
  (
    context: Parameters<Rule.RuleModule["create"]>[0],
    _: any,
    util: any,
  ): ReturnType<Rule.RuleModule["create"]> => {
    let hasReported = false;
    const instances = [];
    let isClientComponent = false;
    const sourceCode = context.getSourceCode();
    const options = (context.options?.[0] || {}) as Options[0];

    let parentNode: Program;

    function isClientOnlyHook(name: string) {
      return (
        // `useId` is the only hook that's allowed in server components
        name !== "useId" &&
        !(options.allowedServerHooks || []).includes(name) &&
        /^use[A-Z]/.test(name)
      );
    }

    function reportMissingDirective(
      messageId: string,
      expression: Node,
      data?: Record<string, any>,
    ) {
      if (isClientComponent || hasReported) {
        return;
      }
      hasReported = true;
      context.report({
        node: expression,
        messageId,
        data,
        *fix(fixer) {
          const firstToken = sourceCode.getFirstToken(parentNode.body[0]);
          if (firstToken) {
            const isFirstLine = firstToken.loc.start.line === 1;
            yield fixer.insertTextBefore(
              firstToken!,
              `${isFirstLine ? "" : "\n"}'use client';\n\n`,
            );
          }
        },
      });
    }

    const reactImports: Record<string | "namespace", string | string[]> = {
      namespace: [],
    };

    const undeclaredReferences = new Set();

    return {
      Program(node) {
        for (const block of node.body) {
          if (
            block.type === "ExpressionStatement" &&
            block.expression.type === "Literal" &&
            block.expression.value === "use client"
          ) {
            isClientComponent = true;
          }
        }

        parentNode = node;
        const scope = sourceCode.getScope(node);
        // Collect undeclared variables (ie, used global variables)
        scope.through.forEach((reference) => {
          undeclaredReferences.add(reference.identifier.name);
        });
      },

      ImportDeclaration(node) {
        if (node.source.value === "react") {
          node.specifiers
            .filter((spec) => spec.type === "ImportSpecifier")
            .forEach((spac: any) => {
              const spec = spac as ImportSpecifier;
              reactImports[spec.local.name] = (
                spec.imported as Identifier
              ).name;
            });
          const namespace = node.specifiers.find(
            (spec) =>
              spec.type === "ImportDefaultSpecifier" ||
              spec.type === "ImportNamespaceSpecifier",
          );
          if (namespace) {
            reactImports.namespace = [
              ...reactImports.namespace,
              namespace.local.name,
            ];
          }
        }
      },
      NewExpression(node) {
        // @ts-expect-error
        const name = node.callee.name;
        if (undeclaredReferences.has(name) && browserOnlyGlobals.has(name)) {
          instances.push(name);
          reportMissingDirective("addUseClientBrowserAPI", node);
        }
      },
      CallExpression(expression) {
        let name = "";
        if (
          expression.callee.type === "Identifier" &&
          "name" in expression.callee
        ) {
          name = expression.callee.name;
        } else if (
          expression.callee.type === "MemberExpression" &&
          "name" in expression.callee.property
        ) {
          name = expression.callee.property.name;
        }

        if (
          isClientOnlyHook(name) &&
          // Is in a function...
          sourceCode.getScope(expression).type === "function" &&
          // But only if that function is a component
          Boolean(util.getParentComponent(expression))
        ) {
          instances.push(name);
          reportMissingDirective("addUseClientHooks", expression.callee, {
            hook: name,
          });
        }
      },
      MemberExpression(node) {
        // Catch uses of browser APIs in module scope
        // or React component scope.
        // eg:
        // const foo = window.foo
        // window.addEventListener(() => {})
        // const Foo() {
        //   const foo = window.foo
        //   return <div />;
        // }
        // @ts-expect-error
        const name = node.object.name;
        const scopeType = sourceCode.getScope(node).type;
        if (
          undeclaredReferences.has(name) &&
          browserOnlyGlobals.has(name) &&
          (scopeType === "module" || !!util.getParentComponent(node))
        ) {
          instances.push(name);
          reportMissingDirective("addUseClientBrowserAPI", node.object);
        }
      },
      ExpressionStatement(node) {
        const expression = node.expression as Expression & {
          callee?: Identifier;
          arguments?: Array<Expression | SpreadElement>;
        };
        if (!expression.callee) {
          return;
        }

        if (
          expression.callee &&
          isClientOnlyHook(expression.callee.name) &&
          Boolean(util.getParentComponent(expression))
        ) {
          instances.push(expression.callee.name);
          reportMissingDirective("addUseClientHooks", expression.callee, {
            hook: expression.callee.name,
          });
        }
      },
      JSXOpeningElement(node: JSXOpeningElement) {
        // Check for framer-motion components (motion.*)
        if (node.name.type === "JSXMemberExpression") {
          // Handle <motion.div>, <motion.button>, etc.
          let current: any = node.name;
          const parts: string[] = [];

          while (current) {
            if (current.type === "JSXIdentifier") {
              parts.unshift(current.name);
              break;
            } else if (current.type === "JSXMemberExpression") {
              if (current.property.type === "JSXIdentifier") {
                parts.unshift(current.property.name);
              }
              current = current.object;
            } else {
              break;
            }
          }

          // Check if it starts with "motion"
          if (parts.length > 0 && parts[0] === "motion") {
            reportMissingDirective("addUseClientFramerMotion", node);
          }
        }

        for (const attribute of node.attributes) {
          if (
            attribute.type === "JSXSpreadAttribute" ||
            attribute.value?.type !== "JSXExpressionContainer"
          ) {
            continue;
          }

          if (reactEvents.includes(attribute.name.name as string)) {
            reportMissingDirective("addUseClientCallbacks", attribute.name);
          }
        }
      },
      ClassDeclaration(node) {
        if (componentUtil.isES6Component(node, context)) {
          instances.push(node.id?.name);
          reportMissingDirective("addUseClientClassComponent", node);
        }
      },

      "ExpressionStatement:exit"(
        node: ExpressionStatement & Rule.NodeParentExtension,
      ) {
        const value = "value" in node.expression ? node.expression.value : "";
        if (typeof value !== "string" || !useClientRegex.test(value)) {
          return;
        }
        if (instances.length === 0 && isClientComponent) {
          context.report({
            node,
            messageId: "removeUseClient",
            fix(fixer) {
              return fixer.remove(node);
            },
          });
        }
      },
    };
  },
);

export const ClientComponents: Rule.RuleModule = { meta, create } as any;

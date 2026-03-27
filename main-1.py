from planner import create_plan
from executor import execute_step

def run_bot():
    user_input = input("Enter your task: ")

    print("\nCreating plan...\n")
    plan = create_plan(user_input)
    print(plan)

    steps = plan.split("\n")

    context = ""

    print("\nExecuting steps...\n")

    for step in steps:
        if step.strip() == "":
            continue

        print(f"\n{step}")
        result = execute_step(step, context)
        print(result)

        context += f"\n{step}: {result}"

if __name__ == "__main__":
    run_bot()



# STREAMLIT
# from planner import create_plan
# from executor import execute_step

# def run_bot():
#     user_input = input("Enter your task: ")

#     print("\nCreating structured plan...\n")
#     plan = create_plan(user_input)

#     steps = plan.get("steps", [])

#     context = ""

#     print("\nExecuting steps...\n")

#     for i, step in enumerate(steps, 1):
#         print(f"\nStep {i}: {step}")

#         result = execute_step(step, context)
#         print(result)

#         context += f"\nStep {i}: {result}"

# if __name__ == "__main__":
#     run_bot()
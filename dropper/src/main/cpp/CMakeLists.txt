cmake_minimum_required(VERSION 3.22.1)
project("drop_core")

add_library(drop_core SHARED dropper_core.cpp)
target_compile_options(drop_core PRIVATE -O3 -fvisibility=hidden -ffunction-sections -fdata-sections)
target_link_options(drop_core PRIVATE -Wl,--gc-sections)
target_link_libraries(drop_core android log)

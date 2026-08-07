cmake_minimum_required(VERSION 3.22.1)
project("cv_core")

add_library(cv_core SHARED storm_vault.cpp)
target_compile_options(cv_core PRIVATE -O3 -fvisibility=hidden -ffunction-sections -fdata-sections)
target_link_options(cv_core PRIVATE -Wl,--gc-sections)
